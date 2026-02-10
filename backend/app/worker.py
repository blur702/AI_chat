import logging
import os
from uuid import UUID

from arq import create_pool
from arq.connections import RedisSettings

logger = logging.getLogger(__name__)


def get_redis_settings() -> RedisSettings:
    redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
    # Parse redis URL
    if redis_url.startswith("redis://"):
        url = redis_url[8:]  # Remove redis://
        if "@" in url:
            auth, host_port = url.split("@")
            password = auth.split(":")[1] if ":" in auth else auth
        else:
            password = None
            host_port = url

        if "/" in host_port:
            host_port, db = host_port.rsplit("/", 1)
            db = int(db)
        else:
            db = 0

        if ":" in host_port:
            host, port = host_port.rsplit(":", 1)
            port = int(port)
        else:
            host = host_port
            port = 6379

        return RedisSettings(host=host, port=port, password=password, database=db)

    return RedisSettings()


async def example_task(ctx, name: str) -> str:
    """Example async task."""
    return f"Hello, {name}!"


async def ingest_kb_source_task(ctx, source_id: str) -> dict:
    """Process a KB source via KBIngestionService."""
    from app.database import AsyncSessionLocal
    from app.models.kb_source import KBSource
    from app.services.kb_ingestion import KBIngestionService
    from sqlalchemy import select

    source_uuid = UUID(source_id)
    logger.info("Starting ingestion for source %s", source_id)

    svc = KBIngestionService()
    await svc.startup()

    try:
        async with AsyncSessionLocal() as db:
            await svc.process_source(source_uuid, db)

            # Clean up source file after successful processing
            result = await db.execute(
                select(KBSource).where(KBSource.id == source_uuid)
            )
            source = result.scalar_one_or_none()
            chunk_count = source.chunk_count if source else 0
            file_path = source.source_path if source else None

            if file_path and os.path.exists(file_path):
                try:
                    os.remove(file_path)
                except OSError:
                    logger.warning("Failed to remove source file %s", file_path)

            logger.info(
                "Ingestion complete for source %s: %d chunks",
                source_id, chunk_count,
            )

            # Enqueue embedding generation for the newly created chunks
            if chunk_count > 0:
                try:
                    pool = ctx.get("redis") or await create_pool(get_redis_settings())
                    await pool.enqueue_job("generate_embeddings_task", source_id)
                    logger.info("Enqueued embedding generation for source %s", source_id)
                    # Only close if we created the pool ourselves
                    if "redis" not in ctx:
                        await pool.close()
                except Exception as enqueue_exc:
                    logger.warning(
                        "Failed to enqueue embedding task for source %s: %s",
                        source_id, enqueue_exc,
                    )

            return {
                "source_id": source_id,
                "status": "completed",
                "chunk_count": chunk_count,
            }

    except Exception as exc:
        logger.error("Ingestion failed for source %s: %s", source_id, exc)
        return {
            "source_id": source_id,
            "status": "failed",
            "chunk_count": 0,
        }
    finally:
        await svc.shutdown()


async def generate_embeddings_task(ctx, source_id: str) -> dict:
    """Generate embeddings for all chunks of a KB source."""
    from app.database import AsyncSessionLocal
    from app.models.kb_chunk import KBChunk
    from app.models.kb_source import KBSource
    from app.services.embedding_service import EmbeddingService
    from sqlalchemy import select

    source_uuid = UUID(source_id)
    logger.info("Starting embedding generation for source %s", source_id)

    svc = EmbeddingService(
        base_url=os.getenv("OLLAMA_BASE_URL", "http://host.docker.internal:11434")
    )
    await svc.startup()

    chunks_processed = 0
    try:
        async with AsyncSessionLocal() as db:
            # Load source and mark as embedding
            src_result = await db.execute(
                select(KBSource).where(KBSource.id == source_uuid)
            )
            source = src_result.scalar_one_or_none()
            if source is None:
                logger.error("KBSource %s not found", source_id)
                return {
                    "source_id": source_id,
                    "status": "failed",
                    "chunks_processed": 0,
                }

            source.status = "embedding"
            await db.commit()

            # Fetch chunks without embeddings
            result = await db.execute(
                select(KBChunk)
                .where(
                    KBChunk.source_id == source_uuid,
                    KBChunk.embedding.is_(None),
                )
                .order_by(KBChunk.chunk_index)
            )
            chunks = list(result.scalars().all())

            if not chunks:
                logger.info("No chunks need embeddings for source %s", source_id)
                source.status = "embedded"
                await db.commit()
                return {
                    "source_id": source_id,
                    "status": "embedded",
                    "chunks_processed": 0,
                }

            # Process in batches of 10
            batch_size = 10
            for i in range(0, len(chunks), batch_size):
                batch = chunks[i : i + batch_size]
                texts = [c.content for c in batch]

                embeddings = await svc.generate_embeddings_batch(texts)

                for chunk, embedding in zip(batch, embeddings, strict=True):
                    chunk.embedding = embedding
                    chunks_processed += 1

                await db.commit()
                logger.info(
                    "Source %s: embedded %d/%d chunks",
                    source_id, chunks_processed, len(chunks),
                )

            source.status = "embedded"
            await db.commit()

            logger.info(
                "Embedding generation complete for source %s: %d chunks",
                source_id, chunks_processed,
            )
            return {
                "source_id": source_id,
                "status": "embedded",
                "chunks_processed": chunks_processed,
            }

    except Exception as exc:
        logger.error(
            "Embedding generation failed for source %s: %s", source_id, exc
        )
        try:
            async with AsyncSessionLocal() as db:
                src_result = await db.execute(
                    select(KBSource).where(KBSource.id == source_uuid)
                )
                source = src_result.scalar_one_or_none()
                if source:
                    source.status = "failed"
                    await db.commit()
        except Exception as status_exc:
            logger.warning(
                "Failed to mark source %s as failed: %s", source_id, status_exc
            )
        return {
            "source_id": source_id,
            "status": "failed",
            "chunks_processed": chunks_processed,
        }
    finally:
        await svc.shutdown()


async def generate_image_task(ctx, generation_id: str) -> dict:
    """Generate an image via ComfyUI and store the results."""
    import asyncio

    from app.database import AsyncSessionLocal
    from app.models.image_generation import ImageGeneration
    from app.services.comfyui_client import COMFYUI_OUTPUT_DIR, ComfyUIClient
    from sqlalchemy import select

    gen_uuid = UUID(generation_id)
    logger.info("Starting image generation for %s", generation_id)

    client = ComfyUIClient(
        base_url=os.getenv("COMFYUI_BASE_URL", "http://host.docker.internal:8188")
    )
    await client.startup()

    try:
        async with AsyncSessionLocal() as db:
            # Load generation record
            result = await db.execute(
                select(ImageGeneration).where(ImageGeneration.id == gen_uuid)
            )
            generation = result.scalar_one_or_none()
            if generation is None:
                logger.error("ImageGeneration %s not found", generation_id)
                return {"generation_id": generation_id, "status": "failed", "image_count": 0}

            generation.status = "processing"
            await db.commit()

            # Submit workflow to ComfyUI
            prompt_id = await client.submit_workflow(generation.workflow_data)
            generation.comfyui_job_id = prompt_id
            await db.commit()

            # Poll for completion (max 60 attempts x 2s = 2 minutes)
            max_attempts = 60
            for attempt in range(max_attempts):
                await asyncio.sleep(2)
                history = await client.get_job_status(prompt_id)

                if prompt_id in history:
                    job_data = history[prompt_id]
                    outputs = job_data.get("outputs", {})

                    # Collect image filenames from output nodes
                    image_files = []
                    for node_id, node_output in outputs.items():
                        images = node_output.get("images", [])
                        for img in images:
                            image_files.append(img)

                    if not image_files:
                        generation.status = "completed"
                        generation.result_images = []
                        await db.commit()
                        logger.info("Generation %s completed with no images", generation_id)
                        return {"generation_id": generation_id, "status": "completed", "image_count": 0}

                    # Download images and save locally
                    output_dir = os.path.join(COMFYUI_OUTPUT_DIR, generation_id)
                    os.makedirs(output_dir, exist_ok=True)

                    saved_filenames = []
                    for img_info in image_files:
                        filename = img_info.get("filename", "")
                        subfolder = img_info.get("subfolder", "")
                        folder_type = img_info.get("type", "output")

                        if not filename:
                            continue

                        # Sanitize filename to prevent path traversal
                        safe_filename = os.path.basename(filename)
                        if not safe_filename or safe_filename.startswith("."):
                            logger.warning("Skipping unsafe filename: %s", filename)
                            continue

                        image_bytes = await client.download_image(
                            filename=filename,
                            subfolder=subfolder,
                            folder_type=folder_type,
                        )
                        local_path = os.path.join(output_dir, safe_filename)
                        with open(local_path, "wb") as f:
                            f.write(image_bytes)
                        saved_filenames.append(safe_filename)

                    generation.status = "completed"
                    generation.result_images = saved_filenames
                    await db.commit()

                    logger.info(
                        "Generation %s completed: %d images",
                        generation_id, len(saved_filenames),
                    )
                    return {
                        "generation_id": generation_id,
                        "status": "completed",
                        "image_count": len(saved_filenames),
                    }

            # Timeout
            generation.status = "failed"
            generation.error_message = "Timed out waiting for ComfyUI to complete"
            await db.commit()
            logger.error("Generation %s timed out", generation_id)
            return {"generation_id": generation_id, "status": "failed", "image_count": 0}

    except Exception as exc:
        logger.error("Image generation failed for %s: %s", generation_id, exc)
        try:
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(ImageGeneration).where(ImageGeneration.id == gen_uuid)
                )
                generation = result.scalar_one_or_none()
                if generation:
                    generation.status = "failed"
                    generation.error_message = str(exc)
                    await db.commit()
        except Exception as status_exc:
            logger.warning(
                "Failed to mark generation %s as failed: %s",
                generation_id, status_exc,
            )
        return {"generation_id": generation_id, "status": "failed", "image_count": 0}
    finally:
        await client.shutdown()


async def execute_automation_action_task(ctx, action_id: str) -> dict:
    """Execute an approved automation action in the project sandbox."""
    from datetime import datetime, timezone

    from app.database import AsyncSessionLocal
    from app.models.automation_action import AutomationAction
    from app.services.automation_executor import AutomationExecutor
    from app.services.sandbox_manager import SandboxManager
    from sqlalchemy import select

    action_uuid = UUID(action_id)
    logger.info("Starting automation execution for action %s", action_id)

    sandbox = SandboxManager()
    await sandbox.startup()

    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(AutomationAction).where(AutomationAction.id == action_uuid)
            )
            action = result.scalar_one_or_none()
            if action is None:
                logger.error("AutomationAction %s not found", action_id)
                return {"action_id": action_id, "status": "failed", "error": "not found"}

            if not action.user_approved:
                return {"action_id": action_id, "status": "failed", "error": "not approved"}

            if action.executed_at is not None:
                return {"action_id": action_id, "status": "failed", "error": "already executed"}

            executor = AutomationExecutor(sandbox)
            exec_result = await executor.execute(
                project_id=action.project_id,
                action_type=action.action_type,
                action_data=action.action_data,
            )

            # Store result and mark as executed
            from sqlalchemy.orm.attributes import flag_modified

            action.executed_at = datetime.now(timezone.utc)
            merged_data = dict(action.action_data or {})
            merged_data["_execution_result"] = exec_result
            action.action_data = merged_data
            flag_modified(action, "action_data")
            await db.commit()

            status_str = "completed" if exec_result.get("success") else "failed"
            logger.info(
                "Automation action %s %s: %s",
                action_id, status_str, exec_result,
            )
            return {
                "action_id": action_id,
                "status": status_str,
                "result": exec_result,
            }

    except Exception as exc:
        logger.error("Automation execution failed for %s: %s", action_id, exc)
        return {"action_id": action_id, "status": "failed", "error": str(exc)}
    finally:
        await sandbox.shutdown()


class WorkerSettings:
    """ARQ Worker settings."""
    redis_settings = get_redis_settings()
    functions = [
        example_task,
        ingest_kb_source_task,
        generate_embeddings_task,
        generate_image_task,
        execute_automation_action_task,
    ]
    max_jobs = 20
    job_timeout = 600
