"""
Worker module for background tasks and job processing.

Handles asynchronous task execution, Redis queue management, file operations, and utility functions for backend services.
Integrates with ARQ for distributed task scheduling and provides helpers for sandboxing, file extraction, and job orchestration.
"""
import asyncio
import hashlib
import io
import logging
import os
import re
import shlex
import tarfile
import tempfile
from html import unescape
from pathlib import Path, PurePosixPath
from typing import Optional
from urllib.parse import parse_qsl, quote, unquote, urlencode, urljoin, urlparse, urlunparse
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
        base_url=os.getenv("OLLAMA_BASE_URL", "http://ollama:11434")
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
    import time

    import redis.asyncio as aioredis

    from app.database import AsyncSessionLocal
    from app.kernel.event_bus import EventBus
    from app.kernel.event_types import (
        IMAGE_GENERATION_COMPLETED,
        IMAGE_GENERATION_FAILED,
        IMAGE_GENERATION_PROGRESS,
        IMAGE_GENERATION_STARTED,
    )
    from app.models.image_generation import ImageGeneration
    from app.services.comfyui_client import COMFYUI_OUTPUT_DIR, ComfyUIClient
    from sqlalchemy import select

    gen_uuid = UUID(generation_id)
    logger.info("Starting image generation for %s", generation_id)

    client = ComfyUIClient(
        base_url=os.getenv("COMFYUI_BASE_URL", "http://comfyui:8188")
    )
    await client.startup()

    redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
    redis_client = aioredis.from_url(redis_url, decode_responses=True)
    event_bus = None
    start_time = time.monotonic()

    try:
        # Set up EventBus for real-time notifications
        event_bus = EventBus(
            session_factory=AsyncSessionLocal, redis_client=redis_client
        )
        await event_bus.startup()

        async with AsyncSessionLocal() as db:
            # Load generation record
            result = await db.execute(
                select(ImageGeneration).where(
                    ImageGeneration.id == gen_uuid,
                    ImageGeneration.is_deleted == False,  # noqa: E712
                )
            )
            generation = result.scalar_one_or_none()
            if generation is None:
                logger.error("ImageGeneration %s not found or deleted", generation_id)
                return {"generation_id": generation_id, "status": "failed", "image_count": 0}

            generation.status = "processing"
            await db.commit()

            workflow_type = generation.workflow_data.get("_workflow_type", "text2img") if generation.workflow_data else "text2img"
            prompt_preview = generation.workflow_data.get("_prompt_preview", "") if generation.workflow_data else ""

            # Strip metadata keys before submitting to ComfyUI
            clean_workflow = {
                k: v for k, v in (generation.workflow_data or {}).items()
                if not k.startswith("_")
            }

            # Submit workflow to ComfyUI
            prompt_id = await client.submit_workflow(clean_workflow)
            generation.comfyui_job_id = prompt_id
            await db.commit()

            # Publish IMAGE_GENERATION_STARTED
            await event_bus.publish_event(
                event_type=IMAGE_GENERATION_STARTED,
                event_data={
                    "generation_id": generation_id,
                    "workflow_type": workflow_type,
                    "prompt_preview": prompt_preview[:100],
                },
                severity="info",
                source="worker",
            )

            # Poll for completion (max 240 attempts x 2s = 8 minutes)
            max_attempts = 240
            for attempt in range(max_attempts):
                await asyncio.sleep(2)

                # Check ComfyUI queue for progress info and publish progress events
                if attempt % 5 == 0 and attempt > 0:
                    try:
                        queue = await client.get_queue_status()
                        running = queue.get("queue_running", [])
                        pending = queue.get("queue_pending", [])
                        elapsed = round(time.monotonic() - start_time, 1)
                        logger.debug(
                            "Generation %s poll %d: %d running, %d pending in ComfyUI queue",
                            generation_id, attempt, len(running), len(pending),
                        )
                        await event_bus.publish_event(
                            event_type=IMAGE_GENERATION_PROGRESS,
                            event_data={
                                "generation_id": generation_id,
                                "queue_running": len(running),
                                "queue_pending": len(pending),
                                "elapsed_seconds": elapsed,
                                "poll_attempt": attempt,
                            },
                            severity="info",
                            source="worker",
                        )
                    except Exception:
                        pass

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
                        await event_bus.publish_event(
                            event_type=IMAGE_GENERATION_COMPLETED,
                            event_data={
                                "generation_id": generation_id,
                                "image_count": 0,
                                "result_images": [],
                            },
                            severity="info",
                            source="worker",
                        )
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

                    # Extract generation parameters for metadata panel
                    meta: dict = {}
                    for node_val in (generation.workflow_data or {}).values():
                        if not isinstance(node_val, dict):
                            continue
                        ct = node_val.get("class_type", "")
                        inputs = node_val.get("inputs", {})
                        if ct == "KSampler":
                            meta["seed"] = inputs.get("seed")
                            meta["steps"] = inputs.get("steps")
                            meta["cfg"] = inputs.get("cfg")
                            meta["sampler"] = inputs.get("sampler_name")
                            meta["scheduler"] = inputs.get("scheduler")
                            meta["denoise"] = inputs.get("denoise")
                        elif ct == "CheckpointLoaderSimple":
                            meta["model"] = inputs.get("ckpt_name")
                        elif ct == "EmptyLatentImage":
                            meta["width"] = inputs.get("width")
                            meta["height"] = inputs.get("height")
                        elif ct == "LoraLoader" and "lora_name" in inputs:
                            loras = meta.setdefault("loras", [])
                            loras.append(inputs.get("lora_name"))
                    if meta:
                        generation.generation_metadata = meta

                    await db.commit()

                    await event_bus.publish_event(
                        event_type=IMAGE_GENERATION_COMPLETED,
                        event_data={
                            "generation_id": generation_id,
                            "image_count": len(saved_filenames),
                            "result_images": saved_filenames,
                        },
                        severity="info",
                        source="worker",
                    )

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
            generation.error_message = "Timed out after 8 minutes waiting for ComfyUI. Try reducing steps or batch size."
            await db.commit()
            await event_bus.publish_event(
                event_type=IMAGE_GENERATION_FAILED,
                event_data={
                    "generation_id": generation_id,
                    "error": "Timed out after 8 minutes",
                },
                severity="error",
                source="worker",
            )
            logger.error("Generation %s timed out", generation_id)
            return {"generation_id": generation_id, "status": "failed", "image_count": 0}

    except Exception as exc:
        logger.error("Image generation failed for %s: %s", generation_id, exc)
        # Publish failure event
        try:
            if event_bus is not None:
                await event_bus.publish_event(
                    event_type=IMAGE_GENERATION_FAILED,
                    event_data={
                        "generation_id": generation_id,
                        "error": str(exc)[:200],
                    },
                    severity="error",
                    source="worker",
                )
        except Exception:
            logger.warning("Failed to publish IMAGE_GENERATION_FAILED event")
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
        if event_bus is not None:
            try:
                await event_bus.shutdown()
            except Exception:
                pass
        try:
            await redis_client.aclose()
        except Exception:
            pass


async def compact_conversation_task(ctx, chat_id: str) -> dict:
    """Background task for LLM-based conversation compaction.

    Creates a pending compaction record, then runs actual summarization via
    the OllamaClient to produce a real summary of older messages.
    Publishes compaction lifecycle events via EventBus.
    """
    import redis.asyncio as aioredis

    from app.database import AsyncSessionLocal
    from app.kernel.context_manager import ContextManager
    from app.kernel.event_bus import EventBus
    from app.kernel.event_types import (
        COMPACTION_COMPLETED,
        COMPACTION_FAILED,
        COMPACTION_STARTED,
    )

    chat_uuid = UUID(chat_id)
    logger.info("Starting compaction task for chat %s", chat_id)

    redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
    redis_client = aioredis.from_url(redis_url, decode_responses=True)

    cm = ContextManager(
        session_factory=AsyncSessionLocal, redis_client=redis_client
    )
    event_bus = None

    try:
        await cm.startup()

        # Create a lightweight EventBus sharing the same Redis connection
        event_bus = EventBus(
            session_factory=AsyncSessionLocal, redis_client=redis_client
        )
        await event_bus.startup()

        compaction_id = await cm.trigger_compaction(chat_uuid)
        if compaction_id is None:
            logger.info(
                "Compaction skipped for chat %s: not enough messages or already pending",
                chat_id,
            )
            return {"chat_id": chat_id, "status": "skipped"}

        # Publish COMPACTION_STARTED
        await event_bus.publish_event(
            event_type=COMPACTION_STARTED,
            event_data={
                "chat_id": chat_id,
                "compaction_id": str(compaction_id),
            },
            severity="info",
            source="worker",
            chat_id=chat_uuid,
        )

        result = await cm.perform_compaction(chat_uuid, compaction_id)
        logger.info("Compaction result for chat %s: %s", chat_id, result)

        # Publish COMPACTION_COMPLETED
        await event_bus.publish_event(
            event_type=COMPACTION_COMPLETED,
            event_data={
                "chat_id": chat_id,
                "compaction_id": str(compaction_id),
                **result,
            },
            severity="info",
            source="worker",
            chat_id=chat_uuid,
        )

        return {"chat_id": chat_id, **result}

    except Exception as exc:
        logger.error("Compaction task failed for chat %s: %s", chat_id, exc)

        # Publish COMPACTION_FAILED (sanitize error message)
        error_msg = str(exc)[:200] if exc else "Unknown error"
        try:
            if event_bus is not None:
                await event_bus.publish_event(
                    event_type=COMPACTION_FAILED,
                    event_data={
                        "chat_id": chat_id,
                        "error": error_msg,
                    },
                    severity="error",
                    source="worker",
                    chat_id=chat_uuid,
                )
        except Exception:
            logger.warning("Failed to publish COMPACTION_FAILED event")

        return {"chat_id": chat_id, "status": "failed", "error": error_msg}

    finally:
        try:
            await cm.shutdown()
        except Exception:
            logger.warning("Failed to shut down ContextManager in compaction task")
        if event_bus is not None:
            try:
                await event_bus.shutdown()
            except Exception:
                logger.warning("Failed to shut down EventBus in compaction task")
        try:
            await redis_client.aclose()
        except Exception:
            logger.warning("Failed to close Redis client in compaction task")


async def execute_automation_action_task(ctx, action_id: str) -> dict:
    """Execute an approved automation action in the project sandbox."""
    from datetime import datetime, timezone

    from app.database import AsyncSessionLocal
    from app.models.automation_action import AutomationAction
    from app.models.project import Project
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

            # Look up the project's template_id
            proj_result = await db.execute(
                select(Project.template_id).where(Project.id == action.project_id)
            )
            project_template_id = proj_result.scalar_one_or_none()

            executor = AutomationExecutor(sandbox)
            exec_result = await executor.execute(
                project_id=action.project_id,
                action_type=action.action_type,
                action_data=action.action_data,
                template_id=project_template_id,
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


def _get_install_command(project_type: str, framework: str | None, file_paths: list[str]) -> str | None:
    """Return the appropriate dependency install command for a project type."""
    names = {p.rsplit("/", 1)[-1] if "/" in p else p for p in file_paths}

    if project_type == "python":
        if "requirements.txt" in names:
            return "pip install -r requirements.txt"
        if "pyproject.toml" in names:
            return "pip install -e ."
        return None

    if project_type == "node":
        if "pnpm-lock.yaml" in names:
            return "pnpm install"
        if "yarn.lock" in names:
            return "yarn install"
        if "package-lock.json" in names:
            return "npm ci"
        return "npm install"

    if project_type == "php":
        return "composer install --no-interaction"

    if project_type == "ruby":
        return "bundle install"

    return None


def _validate_archive(path: str) -> None:
    """Validate an uploaded archive for security.

    Raises ValueError on rejection.
    """
    import tarfile
    import zipfile

    max_size = 500 * 1024 * 1024  # 500MB
    file_size = os.path.getsize(path)
    if file_size > max_size:
        raise ValueError(f"Archive too large ({file_size} bytes, max {max_size})")

    if zipfile.is_zipfile(path):
        with zipfile.ZipFile(path, "r") as zf:
            for info in zf.infolist():
                # Reject symlinks (external_attr check for Unix symlinks)
                if (info.external_attr >> 16) & 0o170000 == 0o120000:
                    raise ValueError(f"Archive contains symlink: {info.filename}")
                # Reject path traversal
                if ".." in info.filename or info.filename.startswith("/"):
                    raise ValueError(f"Archive contains unsafe path: {info.filename}")
    elif tarfile.is_tarfile(path):
        with tarfile.open(path, "r:*") as tf:
            for member in tf.getmembers():
                if member.issym() or member.islnk():
                    raise ValueError(f"Archive contains symlink: {member.name}")
                if ".." in member.name or member.name.startswith("/"):
                    raise ValueError(f"Archive contains unsafe path: {member.name}")
    else:
        raise ValueError("Unsupported archive format (must be zip or tar)")


async def import_git_project_task(ctx, import_id: str) -> dict:
    """Clone a Git repository into a project container."""
    import shlex

    from app.database import AsyncSessionLocal
    from app.models.project import Project
    from app.models.project_import import ProjectImport
    from app.services.project_detector import ProjectDetector
    from app.services.sandbox_manager import SandboxManager
    from sqlalchemy import select

    import_uuid = UUID(import_id)
    logger.info("Starting git import for %s", import_id)

    sandbox = SandboxManager()
    await sandbox.startup()

    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(ProjectImport).where(ProjectImport.id == import_uuid)
            )
            record = result.scalar_one_or_none()
            if record is None:
                logger.error("ProjectImport %s not found", import_id)
                return {"import_id": import_id, "status": "failed"}

            # Look up the project's template_id
            proj_result = await db.execute(
                select(Project.template_id).where(Project.id == record.project_id)
            )
            project_template_id = proj_result.scalar_one_or_none()

            # Update status: cloning
            record.status = "cloning"
            record.progress_message = "Cloning repository..."
            await db.commit()

            git_url = record.source_url
            branch = record.import_options.get("branch")
            install_deps = record.import_options.get("install_deps", True)

            # Ensure container exists
            container_id = await sandbox.get_or_create_container(
                record.project_id, template_id=project_template_id
            )

            # Clone into a temp directory, then copy to /workspace
            clone_cmd = f"git clone --depth 1 {shlex.quote(git_url)}"
            if branch:
                clone_cmd += f" --branch {shlex.quote(branch)}"
            clone_cmd += " /tmp/_clone"

            try:
                await sandbox._exec_simple(container_id, clone_cmd)
            except RuntimeError as e:
                record.status = "failed"
                record.error_message = f"Git clone failed: {e}"
                await db.commit()
                return {"import_id": import_id, "status": "failed"}

            # Copy cloned files to workspace and clean up
            await sandbox._exec_simple(
                container_id, "cp -a /tmp/_clone/. /workspace/ && rm -rf /tmp/_clone"
            )

            # Detect project type
            record.status = "detecting"
            record.progress_message = "Detecting project type..."
            await db.commit()

            detection = await ProjectDetector.detect_from_container(sandbox, container_id)
            record.detected_type = detection.project_type
            record.detected_template_id = detection.suggested_template_id
            await db.commit()

            # Install dependencies if requested
            if install_deps and detection.project_type != "unknown":
                entries = await sandbox.list_directory_recursive(container_id)
                file_paths = [e["path"] for e in entries]
                install_cmd = _get_install_command(
                    detection.project_type, detection.framework, file_paths
                )
                if install_cmd:
                    record.status = "installing"
                    record.progress_message = f"Running: {install_cmd}"
                    await db.commit()
                    try:
                        await sandbox._exec_simple(container_id, install_cmd)
                    except RuntimeError as e:
                        logger.warning("Install command failed: %s", e)
                        # Non-fatal; continue to completed

            record.status = "completed"
            record.progress_message = "Import completed successfully"
            await db.commit()

            logger.info("Git import completed for %s", import_id)
            return {"import_id": import_id, "status": "completed"}

    except Exception as exc:
        logger.error("Git import failed for %s: %s", import_id, exc)
        try:
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(ProjectImport).where(ProjectImport.id == import_uuid)
                )
                record = result.scalar_one_or_none()
                if record:
                    record.status = "failed"
                    record.error_message = str(exc)
                    await db.commit()
        except Exception as status_exc:
            logger.warning("Failed to mark import %s as failed: %s", import_id, status_exc)
        return {"import_id": import_id, "status": "failed"}
    finally:
        await sandbox.shutdown()


async def import_archive_project_task(ctx, import_id: str, archive_path: str) -> dict:
    """Extract an uploaded archive into a project container."""
    import io
    import tarfile
    import zipfile

    from app.database import AsyncSessionLocal
    from app.models.project import Project
    from app.models.project_import import ProjectImport
    from app.services.project_detector import ProjectDetector
    from app.services.sandbox_manager import SandboxManager
    from sqlalchemy import select

    import_uuid = UUID(import_id)
    logger.info("Starting archive import for %s", import_id)

    sandbox = SandboxManager()
    await sandbox.startup()

    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(ProjectImport).where(ProjectImport.id == import_uuid)
            )
            record = result.scalar_one_or_none()
            if record is None:
                logger.error("ProjectImport %s not found", import_id)
                return {"import_id": import_id, "status": "failed"}

            # Look up the project's template_id
            proj_result = await db.execute(
                select(Project.template_id).where(Project.id == record.project_id)
            )
            project_template_id = proj_result.scalar_one_or_none()

            # Validate archive
            record.status = "extracting"
            record.progress_message = "Validating archive..."
            await db.commit()

            try:
                _validate_archive(archive_path)
            except ValueError as ve:
                record.status = "failed"
                record.error_message = str(ve)
                await db.commit()
                return {"import_id": import_id, "status": "failed"}

            # Ensure container exists
            container_id = await sandbox.get_or_create_container(
                record.project_id, template_id=project_template_id
            )

            record.progress_message = "Extracting archive..."
            await db.commit()

            # Convert archive to tar format and put into container
            tar_buffer = io.BytesIO()
            if zipfile.is_zipfile(archive_path):
                with zipfile.ZipFile(archive_path, "r") as zf:
                    with tarfile.open(fileobj=tar_buffer, mode="w") as tf:
                        for info in zf.infolist():
                            if info.is_dir():
                                ti = tarfile.TarInfo(name=info.filename)
                                ti.type = tarfile.DIRTYPE
                                ti.mode = 0o755
                                tf.addfile(ti)
                            else:
                                data = zf.read(info.filename)
                                ti = tarfile.TarInfo(name=info.filename)
                                ti.size = len(data)
                                ti.mode = 0o644
                                tf.addfile(ti, io.BytesIO(data))
            else:
                # Already a tar — read raw bytes
                with open(archive_path, "rb") as f:
                    tar_buffer = io.BytesIO(f.read())

            tar_bytes = tar_buffer.getvalue()
            ok = await asyncio.to_thread(
                sandbox._client.api.put_archive, container_id, "/workspace", tar_bytes
            )
            if not ok:
                record.status = "failed"
                record.error_message = "Failed to extract archive into container"
                await db.commit()
                return {"import_id": import_id, "status": "failed"}

            # Detect project type
            record.status = "detecting"
            record.progress_message = "Detecting project type..."
            await db.commit()

            detection = await ProjectDetector.detect_from_container(sandbox, container_id)
            record.detected_type = detection.project_type
            record.detected_template_id = detection.suggested_template_id
            await db.commit()

            # Install dependencies
            install_deps = record.import_options.get("install_deps", True)
            if install_deps and detection.project_type != "unknown":
                entries = await sandbox.list_directory_recursive(container_id)
                file_paths = [e["path"] for e in entries]
                install_cmd = _get_install_command(
                    detection.project_type, detection.framework, file_paths
                )
                if install_cmd:
                    record.status = "installing"
                    record.progress_message = f"Running: {install_cmd}"
                    await db.commit()
                    try:
                        await sandbox._exec_simple(container_id, install_cmd)
                    except RuntimeError as e:
                        logger.warning("Install command failed: %s", e)

            record.status = "completed"
            record.progress_message = "Import completed successfully"
            await db.commit()

            logger.info("Archive import completed for %s", import_id)
            return {"import_id": import_id, "status": "completed"}

    except Exception as exc:
        logger.error("Archive import failed for %s: %s", import_id, exc)
        try:
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(ProjectImport).where(ProjectImport.id == import_uuid)
                )
                record = result.scalar_one_or_none()
                if record:
                    record.status = "failed"
                    record.error_message = str(exc)
                    await db.commit()
        except Exception as status_exc:
            logger.warning("Failed to mark import %s as failed: %s", import_id, status_exc)
        return {"import_id": import_id, "status": "failed"}
    finally:
        await sandbox.shutdown()
        # Clean up temp file
        try:
            if os.path.exists(archive_path):
                os.remove(archive_path)
        except OSError:
            logger.warning("Failed to remove temp archive %s", archive_path)


_TRACKING_QUERY_KEYS = {
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "gclid",
    "fbclid",
    "mc_cid",
    "mc_eid",
}
_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".bmp", ".avif"}
_JS_EXTENSIONS = {".js", ".mjs", ".cjs"}
_CSS_EXTENSIONS = {".css"}


def _normalize_crawl_url(url: str) -> Optional[str]:
    parsed = urlparse(url.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return None
    kept_query = [
        (k, v)
        for k, v in parse_qsl(parsed.query, keep_blank_values=True)
        if k.lower() not in _TRACKING_QUERY_KEYS
    ]
    normalized_query = urlencode(sorted(kept_query), doseq=True)
    normalized = urlunparse(
        (
            parsed.scheme.lower(),
            parsed.netloc.lower(),
            parsed.path or "/",
            "",
            normalized_query,
            "",
        )
    )
    return normalized


def _safe_path_parts(path_value: str) -> list[str]:
    parts: list[str] = []
    for part in PurePosixPath(path_value).parts:
        if part in {"", "/", ".", ".."}:
            continue
        clean = re.sub(r"[^A-Za-z0-9._-]", "-", part).strip("-")
        if clean:
            parts.append(clean)
    return parts


def _looks_js_heavy(html: str) -> bool:
    lowered = html.lower()
    markers = [
        'id="root"',
        "id='root'",
        'id="app"',
        "id='app'",
        "__next_data__",
        "webpack",
        "chunk.js",
        "vite",
        "hydrate(",
        "ng-version",
    ]
    hits = sum(marker in lowered for marker in markers)
    no_script = re.sub(r"(?is)<script\b[^>]*>.*?</script>", "", html)
    no_style = re.sub(r"(?is)<style\b[^>]*>.*?</style>", "", no_script)
    text = unescape(re.sub(r"(?is)<[^>]+>", " ", no_style))
    text_density = len(re.sub(r"\s+", "", text)) / max(len(html), 1)
    return hits >= 2 or text_density < 0.03


def _document_dir_name(url: str) -> str:
    parsed = urlparse(url)
    raw_path = unquote(parsed.path or "/")
    parts = _safe_path_parts(raw_path)
    if not parts:
        parts = ["home"]
    page_key = "-".join(parts[:4])[:80]
    if parsed.query:
        qhash = hashlib.sha1(parsed.query.encode("utf-8")).hexdigest()[:8]
        page_key = f"{page_key}-{qhash}"
    return page_key


def _document_html_path(url: str) -> str:
    return f"documents/{_document_dir_name(url)}/document.html"


def _extract_page_title(html: str) -> str:
    match = re.search(r"(?is)<title[^>]*>(.*?)</title>", html)
    if not match:
        return ""
    title = unescape(re.sub(r"\s+", " ", match.group(1))).strip()
    return title[:200]


def _extract_font_families(text: str) -> list[str]:
    families: set[str] = set()
    for match in re.finditer(r"font-family\s*:\s*([^;}{]+)", text, flags=re.IGNORECASE):
        raw_val = match.group(1)
        for part in raw_val.split(","):
            normalized = part.strip().strip("\"'").lower()
            if normalized and normalized not in {"inherit", "initial", "unset"}:
                families.add(normalized)
    return sorted(families)


def _extract_hex_colors(text: str) -> list[str]:
    colors = re.findall(r"#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b", text)
    out: list[str] = []
    for color in colors:
        c = color.lower()
        if len(c) == 4:
            c = "#" + "".join(ch * 2 for ch in c[1:])
        out.append(c)
    return out


async def _write_design_documents(
    output_dir: Path,
    page_records: list[dict[str, str]],
    asset_count: int,
) -> None:
    font_set: set[str] = set()
    color_count: dict[str, int] = {}

    for page in page_records:
        html = page.get("raw_html", "")
        for font in _extract_font_families(html):
            font_set.add(font)
        for color in _extract_hex_colors(html):
            color_count[color] = color_count.get(color, 0) + 1

    css_dir = output_dir / "css"
    if css_dir.exists():
        for css_file in css_dir.glob("*"):
            if not css_file.is_file():
                continue
            try:
                css_text = await asyncio.to_thread(css_file.read_text, encoding="utf-8", errors="ignore")
            except Exception:
                continue
            for font in _extract_font_families(css_text):
                font_set.add(font)
            for color in _extract_hex_colors(css_text):
                color_count[color] = color_count.get(color, 0) + 1

    top_colors = sorted(color_count.items(), key=lambda kv: kv[1], reverse=True)[:20]
    fonts = sorted(font_set)

    documents_dir = output_dir / "documents"
    documents_dir.mkdir(parents=True, exist_ok=True)

    design_json = {
        "fonts": fonts,
        "top_colors": [{"hex": color, "count": count} for color, count in top_colors],
        "page_count": len(page_records),
        "asset_count": asset_count,
    }
    import json

    await asyncio.to_thread(
        (documents_dir / "design-system.json").write_text,
        json.dumps(design_json, indent=2),
        "utf-8",
    )

    markdown_lines = [
        "# Imported Design Summary",
        "",
        f"- Pages imported: {len(page_records)}",
        f"- Local assets downloaded: {asset_count}",
        "",
        "## Fonts",
        "",
    ]
    if fonts:
        markdown_lines.extend([f"- `{font}`" for font in fonts])
    else:
        markdown_lines.append("- No explicit font-family declarations detected")

    markdown_lines.extend(["", "## Colors", ""])
    if top_colors:
        markdown_lines.extend([f"- `{color}` (seen {count} time(s))" for color, count in top_colors])
    else:
        markdown_lines.append("- No hex colors detected")

    await asyncio.to_thread(
        (documents_dir / "design-system.md").write_text,
        "\n".join(markdown_lines),
        "utf-8",
    )


def _asset_bucket_and_name(url: str, content_type: str) -> tuple[Optional[str], Optional[str]]:
    parsed = urlparse(url)
    path_obj = Path(unquote(parsed.path or ""))
    ext = path_obj.suffix.lower()
    ctype = (content_type or "").lower()

    bucket: Optional[str]
    if ext in _IMAGE_EXTENSIONS or ctype.startswith("image/"):
        bucket = "images"
    elif ext in _JS_EXTENSIONS or "javascript" in ctype:
        bucket = "js"
    elif ext in _CSS_EXTENSIONS or "text/css" in ctype:
        bucket = "css"
    else:
        return None, None

    filename = re.sub(r"[^A-Za-z0-9._-]", "-", path_obj.name or "").strip("-")
    if not filename:
        inferred_ext = ext or (".js" if bucket == "js" else ".css" if bucket == "css" else ".bin")
        filename = f"asset-{hashlib.sha1(url.encode('utf-8')).hexdigest()[:10]}{inferred_ext}"
    if parsed.query:
        qhash = hashlib.sha1(parsed.query.encode("utf-8")).hexdigest()[:8]
        stem = Path(filename).stem
        suffix = Path(filename).suffix
        filename = f"{stem}-{qhash}{suffix}"
    return bucket, filename


def _extract_attr_urls(html: str) -> list[str]:
    pattern = re.compile(r"""(?:href|src|poster)\s*=\s*["']([^"'#]+)["']""", re.IGNORECASE)
    return [match.strip() for match in pattern.findall(html)]


def _extract_anchor_urls(html: str) -> list[str]:
    pattern = re.compile(r"""<a\b[^>]*href\s*=\s*["']([^"'#]+)["']""", re.IGNORECASE)
    return [match.strip() for match in pattern.findall(html)]


def _rewrite_asset_and_page_links(html: str, base_url: str, local_map: dict[str, str]) -> str:
    pattern = re.compile(r"""(?P<attr>href|src|poster)\s*=\s*(?P<q>["'])(?P<u>[^"']+)(?P=q)""", re.IGNORECASE)

    def repl(match: re.Match[str]) -> str:
        raw_url = match.group("u")
        if raw_url.startswith(("mailto:", "tel:", "javascript:", "data:", "#")):
            return match.group(0)
        abs_url = urljoin(base_url, raw_url)
        normalized = _normalize_crawl_url(abs_url)
        if not normalized:
            return match.group(0)
        mapped = local_map.get(normalized)
        if not mapped:
            return match.group(0)
        return f'{match.group("attr")}={match.group("q")}/{mapped}{match.group("q")}'

    return pattern.sub(repl, html)


def _rendered_import_available() -> bool:
    try:
        import playwright.async_api  # noqa: F401

        return True
    except Exception:
        return False


async def _copy_local_site_to_workspace(container_id: str, sandbox, source_dir: Path) -> None:
    await sandbox._exec_simple(container_id, "find /workspace -mindepth 1 -maxdepth 1 -exec rm -rf {} +")

    def build_tar_bytes() -> bytes:
        buf = io.BytesIO()
        with tarfile.open(fileobj=buf, mode="w") as tf:
            for file_path in source_dir.rglob("*"):
                if not file_path.is_file():
                    continue
                arcname = file_path.relative_to(source_dir).as_posix()
                tf.add(file_path, arcname=arcname)
        return buf.getvalue()

    tar_bytes = await asyncio.to_thread(build_tar_bytes)
    ok = await asyncio.to_thread(sandbox._client.api.put_archive, container_id, "/workspace", tar_bytes)
    if not ok:
        raise RuntimeError("Failed to copy mirrored site into workspace")


async def _render_site_to_directory(
    start_url: str,
    output_dir: Path,
    *,
    root_host: str,
    max_depth: int,
    max_pages: int,
    include_assets: bool,
    timeout_seconds: int,
    js_heavy: bool,
) -> tuple[int, int]:
    from playwright.async_api import TimeoutError as PlaywrightTimeoutError
    from playwright.async_api import async_playwright

    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "images").mkdir(parents=True, exist_ok=True)
    (output_dir / "js").mkdir(parents=True, exist_ok=True)
    (output_dir / "css").mkdir(parents=True, exist_ok=True)

    pending: list[tuple[str, int]] = [(_normalize_crawl_url(start_url) or start_url, 0)]
    visited: set[str] = set()
    page_records: list[dict[str, str]] = []
    local_map: dict[str, str] = {}
    downloaded_assets: set[str] = set()

    max_asset_bytes = int(os.getenv("WEBSITE_IMPORT_MAX_ASSET_BYTES", "10485760"))
    max_total_asset_bytes = int(os.getenv("WEBSITE_IMPORT_MAX_TOTAL_ASSET_BYTES", "209715200"))
    total_asset_bytes = 0

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(
            headless=True,
            args=["--disable-dev-shm-usage", "--no-sandbox"],
        )
        context = await browser.new_context(ignore_https_errors=True)
        page = await context.new_page()

        while pending and len(visited) < max_pages:
            current, depth = pending.pop(0)
            if current in visited:
                continue
            parsed = urlparse(current)
            if (parsed.hostname or "").lower() != root_host:
                continue
            visited.add(current)

            try:
                await page.goto(current, wait_until="domcontentloaded", timeout=timeout_seconds * 1000)
                try:
                    await page.wait_for_load_state("networkidle", timeout=min(timeout_seconds, 20) * 1000)
                except PlaywrightTimeoutError:
                    pass
                if js_heavy:
                    await page.wait_for_timeout(1200)
                else:
                    await page.wait_for_timeout(350)
                rendered_html = await page.content()
            except Exception:
                continue

            rel_html_path = _document_html_path(current)
            page_records.append({
                "url": current,
                "rel_html_path": rel_html_path,
                "raw_html": rendered_html,
                "title": _extract_page_title(rendered_html),
            })
            local_map[current] = rel_html_path

            if depth < max_depth:
                for href in _extract_anchor_urls(rendered_html):
                    normalized = _normalize_crawl_url(urljoin(current, href))
                    if not normalized:
                        continue
                    h = (urlparse(normalized).hostname or "").lower()
                    if h != root_host or normalized in visited:
                        continue
                    if any(item_url == normalized for item_url, _ in pending):
                        continue
                    pending.append((normalized, depth + 1))

            if not include_assets:
                continue

            for attr_url in _extract_attr_urls(rendered_html):
                normalized = _normalize_crawl_url(urljoin(current, attr_url))
                if not normalized:
                    continue
                if normalized in downloaded_assets:
                    continue
                parsed_asset = urlparse(normalized)
                if (parsed_asset.hostname or "").lower() != root_host:
                    continue

                try:
                    resp = await context.request.get(normalized, timeout=timeout_seconds * 1000)
                    if not resp.ok:
                        continue
                    content_type = resp.headers.get("content-type", "")
                    bucket, filename = _asset_bucket_and_name(normalized, content_type)
                    if not bucket or not filename:
                        continue
                    body = await resp.body()
                    if len(body) > max_asset_bytes:
                        continue
                    if total_asset_bytes + len(body) > max_total_asset_bytes:
                        continue
                    target = output_dir / bucket / filename
                    target.parent.mkdir(parents=True, exist_ok=True)
                    await asyncio.to_thread(target.write_bytes, body)
                    local_map[normalized] = f"{bucket}/{filename}"
                    downloaded_assets.add(normalized)
                    total_asset_bytes += len(body)
                except Exception:
                    continue

        await context.close()
        await browser.close()

    import json

    for record in page_records:
        page_url = record["url"]
        rel_html_path = record["rel_html_path"]
        raw_html = record["raw_html"]
        rewritten = _rewrite_asset_and_page_links(raw_html, page_url, local_map)
        target = output_dir / rel_html_path
        target.parent.mkdir(parents=True, exist_ok=True)
        await asyncio.to_thread(target.write_text, rewritten, encoding="utf-8")

        meta = {
            "source_url": page_url,
            "title": record.get("title", ""),
            "saved_path": rel_html_path,
        }
        meta_target = target.parent / "metadata.json"
        await asyncio.to_thread(meta_target.write_text, json.dumps(meta, indent=2), "utf-8")

    await _write_design_documents(output_dir, page_records, len(downloaded_assets))

    return len(visited), len(downloaded_assets)


async def import_website_project_task(ctx, import_id: str) -> dict:
    """Mirror website content with rendered-page capture and strict same-host asset rules."""
    import httpx

    from app.database import AsyncSessionLocal
    from app.models.project import Project
    from app.models.project_import import ProjectImport
    from app.services.project_detector import ProjectDetector
    from app.services.sandbox_manager import SandboxManager
    from sqlalchemy import select

    import_uuid = UUID(import_id)
    logger.info("Starting website import for %s", import_id)

    sandbox = SandboxManager()
    await sandbox.startup()

    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(ProjectImport).where(ProjectImport.id == import_uuid))
            record = result.scalar_one_or_none()
            if record is None:
                logger.error("ProjectImport %s not found", import_id)
                return {"import_id": import_id, "status": "failed"}

            proj_result = await db.execute(select(Project.template_id).where(Project.id == record.project_id))
            project_template_id = proj_result.scalar_one_or_none()

            website_url = (record.source_url or "").strip()
            normalized_start = _normalize_crawl_url(website_url)
            parsed_start = urlparse(normalized_start or website_url)
            root_host = (parsed_start.hostname or "").lower()
            if not normalized_start or not root_host:
                record.status = "failed"
                record.error_message = "Invalid website URL for import"
                await db.commit()
                return {"import_id": import_id, "status": "failed"}

            include_assets = bool(record.import_options.get("include_assets", True))
            same_domain_only = bool(record.import_options.get("same_domain_only", True))
            install_deps = bool(record.import_options.get("install_deps", False))
            strategy = str(record.import_options.get("strategy", "auto"))
            max_depth = int(record.import_options.get("depth", 2))
            max_pages = int(record.import_options.get("max_pages", 30))
            if max_depth < 1:
                max_depth = 1
            if max_depth > 5:
                max_depth = 5
            if max_pages < 1:
                max_pages = 1
            if max_pages > 200:
                max_pages = 200

            if not same_domain_only:
                # Keep behavior explicit: we still never save off-host resources.
                record.import_options["same_domain_only"] = True
                await db.commit()

            container_id = await sandbox.get_or_create_container(record.project_id, template_id=project_template_id)

            record.status = "crawling"
            record.progress_message = "Analyzing website..."
            await db.commit()

            js_heavy = False
            timeout_seconds = 20
            try:
                async with httpx.AsyncClient(follow_redirects=True, timeout=10.0) as client:
                    res = await client.get(normalized_start)
                    js_heavy = _looks_js_heavy(res.text)
            except Exception:
                js_heavy = True

            if not _rendered_import_available():
                record.status = "failed"
                record.error_message = (
                    "Playwright runtime is not available. "
                    "Website imports require rendered capture for SPA/JS-heavy support."
                )
                await db.commit()
                return {"import_id": import_id, "status": "failed"}

            record.progress_message = (
                "Mirroring rendered pages..."
                if strategy == "rendered" or js_heavy
                else "Mirroring pages..."
            )
            await db.commit()

            with tempfile.TemporaryDirectory(prefix="site-import-") as tmp_dir:
                tmp_path = Path(tmp_dir)
                page_count, asset_count = await _render_site_to_directory(
                    normalized_start,
                    tmp_path,
                    root_host=root_host,
                    max_depth=max_depth,
                    max_pages=max_pages,
                    include_assets=include_assets,
                    timeout_seconds=timeout_seconds,
                    js_heavy=js_heavy,
                )
                if page_count == 0:
                    raise RuntimeError("No pages could be rendered from the target website")
                await _copy_local_site_to_workspace(container_id, sandbox, tmp_path)
                record.progress_message = (
                    f"Mirrored {page_count} page(s) with {asset_count} local asset(s) "
                    "(external-domain assets remain linked)"
                )
                await db.commit()

            record.status = "detecting"
            record.progress_message = "Detecting project type..."
            await db.commit()

            detection = await ProjectDetector.detect_from_container(sandbox, container_id)
            record.detected_type = detection.project_type
            record.detected_template_id = detection.suggested_template_id
            await db.commit()

            if install_deps and detection.project_type != "unknown":
                entries = await sandbox.list_directory_recursive(container_id)
                file_paths = [e["path"] for e in entries]
                install_cmd = _get_install_command(detection.project_type, detection.framework, file_paths)
                if install_cmd:
                    record.status = "installing"
                    record.progress_message = f"Running: {install_cmd}"
                    await db.commit()
                    try:
                        await sandbox._exec_simple(container_id, install_cmd)
                    except RuntimeError as install_err:
                        logger.warning("Install command failed: %s", install_err)

            record.status = "completed"
            record.progress_message = "Website import completed successfully"
            await db.commit()

            logger.info("Website import completed for %s", import_id)
            return {"import_id": import_id, "status": "completed"}

    except Exception as exc:
        logger.error("Website import failed for %s: %s", import_id, exc)
        try:
            async with AsyncSessionLocal() as db:
                result = await db.execute(select(ProjectImport).where(ProjectImport.id == import_uuid))
                record = result.scalar_one_or_none()
                if record:
                    record.status = "failed"
                    record.error_message = str(exc)
                    await db.commit()
        except Exception as status_exc:
            logger.warning("Failed to mark import %s as failed: %s", import_id, status_exc)
        return {"import_id": import_id, "status": "failed"}
    finally:
        await sandbox.shutdown()


async def bulk_ingest_kb_task(ctx, batch_id: str) -> dict:
    """Process a batch of KB files: extract, chunk, embed."""
    import json

    import redis.asyncio as aioredis

    from app.database import AsyncSessionLocal
    from app.models.kb_chunk import KBChunk
    from app.models.kb_source import KBSource
    from app.services.embedding_service import EmbeddingService
    from app.services.kb_ingestion import KBIngestionService

    logger.info("Starting bulk KB ingestion for batch %s", batch_id)

    redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
    redis_client = aioredis.from_url(redis_url, decode_responses=True)
    upload_dir = os.getenv("KB_UPLOAD_DIR", "/var/lib/app/kb_uploads")

    try:
        data = await redis_client.hgetall(f"kb_batch:{batch_id}")
        if not data:
            logger.error("Batch %s not found in Redis", batch_id)
            return {"batch_id": batch_id, "status": "failed"}

        await redis_client.hset(f"kb_batch:{batch_id}", "status", "processing")

        file_ids = json.loads(data.get("file_ids", "[]"))
        chunk_size = int(data.get("chunk_size", 500))
        chunk_overlap = int(data.get("chunk_overlap", 50))
        embedding_model = data.get("embedding_model", "nomic-embed-text")
        image_processing = json.loads(data.get("image_processing", "{}"))
        scope = data.get("scope", "project")
        project_id_str = data.get("project_id", "")
        project_id = UUID(project_id_str) if project_id_str else None

        ingestion_svc = KBIngestionService()
        await ingestion_svc.startup()

        embedding_svc = EmbeddingService(
            base_url=os.getenv("OLLAMA_BASE_URL", "http://ollama:11434")
        )
        await embedding_svc.startup()

        file_statuses = []
        total_chunks = 0
        chunks_embedded = 0
        files_completed = 0
        files_failed = 0

        for file_id in file_ids:
            if (
                not isinstance(file_id, str)
                or os.path.basename(file_id) != file_id
                or any(part in file_id for part in ("..", "/", "\\", os.path.sep))
            ):
                file_statuses.append({
                    "file_id": str(file_id), "filename": str(file_id),
                    "status": "failed", "chunks": 0, "error": "Invalid file identifier",
                })
                files_failed += 1
                continue
            # Find the file on disk
            file_path = None
            filename = file_id
            for entry in os.listdir(upload_dir):
                if entry == file_id or entry.startswith(f"{file_id}_"):
                    file_path = os.path.join(upload_dir, entry)
                    filename = entry.split("_", 1)[1] if "_" in entry else entry
                    break

            if not file_path or not os.path.exists(file_path):
                file_statuses.append({
                    "file_id": file_id, "filename": filename,
                    "status": "failed", "chunks": 0, "error": "File not found",
                })
                files_failed += 1
                continue

            try:
                ext = os.path.splitext(filename)[1].lower()
                image_exts = {".jpg", ".jpeg", ".png"}
                ext_to_type = {
                    ".pdf": "pdf", ".txt": "text", ".md": "markdown",
                    ".html": "html", ".htm": "html", ".csv": "csv",
                    ".jpg": "image", ".jpeg": "image", ".png": "image",
                }
                source_type = ext_to_type.get(ext, "text")

                # Extract text
                if ext in image_exts:
                    method = image_processing.get(file_id, "ocr")
                    if method == "vision":
                        text = await ingestion_svc.extract_text_from_image_vision(
                            file_path,
                            ollama_url=os.getenv("OLLAMA_BASE_URL", "http://ollama:11434"),
                        )
                    elif method == "skip":
                        file_statuses.append({
                            "file_id": file_id, "filename": filename,
                            "status": "skipped", "chunks": 0,
                        })
                        files_completed += 1
                        continue
                    else:
                        text = ingestion_svc.extract_text_from_image_ocr(file_path)
                elif ext == ".pdf":
                    text = ingestion_svc.extract_text_from_pdf(file_path)
                elif ext in {".html", ".htm"}:
                    text = ingestion_svc.extract_text_from_html(file_path)
                elif ext == ".csv":
                    text = ingestion_svc.extract_text_from_csv(file_path)
                else:
                    text = ingestion_svc.extract_text_from_txt(file_path)

                if not text.strip():
                    file_statuses.append({
                        "file_id": file_id, "filename": filename,
                        "status": "failed", "chunks": 0, "error": "No text extracted",
                    })
                    files_failed += 1
                    continue

                # Chunk
                chunks = ingestion_svc.chunk_text(text, chunk_size, chunk_overlap)

                # Create DB records
                async with AsyncSessionLocal() as db:
                    source = KBSource(
                        project_id=project_id if scope == "project" else None,
                        source_type=source_type,
                        source_path=file_path,
                        status="processing",
                        chunk_count=0,
                    )
                    db.add(source)
                    await db.flush()

                    chunk_objects = []
                    for chunk_data in chunks:
                        chunk = KBChunk(
                            source_id=source.id,
                            project_id=project_id if scope == "project" else None,
                            content=chunk_data["content"],
                            chunk_index=chunk_data["index"],
                            chunk_metadata=chunk_data["metadata"],
                        )
                        db.add(chunk)
                        chunk_objects.append(chunk)

                    await db.flush()

                    # Generate embeddings in batches
                    batch_size = 10
                    embedded = 0
                    for i in range(0, len(chunk_objects), batch_size):
                        batch = chunk_objects[i:i + batch_size]
                        texts = [c.content for c in batch]
                        embeddings = await embedding_svc.generate_embeddings_batch(
                            texts, model=embedding_model
                        )
                        for chunk_obj, emb in zip(batch, embeddings, strict=True):
                            chunk_obj.embedding = emb
                            embedded += 1

                    source.chunk_count = len(chunks)
                    source.status = "embedded"
                    await db.commit()

                total_chunks += len(chunks)
                chunks_embedded += embedded
                files_completed += 1

                file_statuses.append({
                    "file_id": file_id, "filename": filename,
                    "status": "completed", "chunks": len(chunks),
                })

            except Exception as exc:
                logger.error("Failed to process file %s: %s", file_id, exc)
                file_statuses.append({
                    "file_id": file_id, "filename": filename,
                    "status": "failed", "chunks": 0, "error": str(exc)[:200],
                })
                files_failed += 1

            # Update progress in Redis after each file
            await redis_client.hset(f"kb_batch:{batch_id}", mapping={
                "files_completed": str(files_completed),
                "files_failed": str(files_failed),
                "total_chunks": str(total_chunks),
                "chunks_embedded": str(chunks_embedded),
                "file_statuses": json.dumps(file_statuses),
            })

            # Clean up uploaded file
            try:
                if file_path and os.path.exists(file_path):
                    os.remove(file_path)
            except OSError:
                pass

        final_status = "completed" if files_failed == 0 else "completed_with_errors"
        await redis_client.hset(f"kb_batch:{batch_id}", mapping={
            "status": final_status,
            "files_completed": str(files_completed),
            "files_failed": str(files_failed),
            "total_chunks": str(total_chunks),
            "chunks_embedded": str(chunks_embedded),
            "file_statuses": json.dumps(file_statuses),
        })
        await redis_client.expire(f"kb_batch:{batch_id}", 7200)  # Keep 2h after completion

        await ingestion_svc.shutdown()
        await embedding_svc.shutdown()

        logger.info(
            "Bulk ingestion batch %s complete: %d files, %d chunks, %d embedded",
            batch_id, files_completed, total_chunks, chunks_embedded,
        )
        return {
            "batch_id": batch_id,
            "status": final_status,
            "files_completed": files_completed,
            "total_chunks": total_chunks,
        }

    except Exception as exc:
        logger.error("Bulk ingestion failed for batch %s: %s", batch_id, exc)
        try:
            await redis_client.hset(f"kb_batch:{batch_id}", "status", "failed")
        except Exception:
            pass
        return {"batch_id": batch_id, "status": "failed", "error": str(exc)}
    finally:
        try:
            await redis_client.aclose()
        except Exception:
            pass


async def verify_plan_phase_task(ctx, phase_id: str) -> dict:
    """Run verification checks for a plan phase in the sandbox."""
    import redis.asyncio as aioredis

    from app.database import AsyncSessionLocal
    from app.kernel.event_bus import EventBus
    from app.kernel.event_types import PLAN_VERIFICATION_COMPLETED
    from app.models.plan_phase import PlanPhase
    from app.models.planning_session import PlanningSession
    from app.models.project import Project
    from app.services.sandbox_manager import SandboxManager
    from app.services.verification_engine import run_verification_checks
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    phase_uuid = UUID(phase_id)
    logger.info("Starting plan phase verification for %s", phase_id)

    sandbox = SandboxManager()
    await sandbox.startup()

    redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
    redis_client = aioredis.from_url(redis_url, decode_responses=True)
    event_bus = None

    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(PlanPhase)
                .options(selectinload(PlanPhase.session))
                .where(PlanPhase.id == phase_uuid)
            )
            phase = result.scalar_one_or_none()
            if phase is None:
                logger.error("PlanPhase %s not found", phase_id)
                return {"phase_id": phase_id, "status": "failed", "error": "not found"}

            session = phase.session
            checks = phase.verification_checks or []
            if not checks:
                phase.status = "completed"
                phase.verification_result = {"passed": True, "results": [], "summary": "No checks defined"}
                await db.commit()
                return {"phase_id": phase_id, "status": "completed", "passed": True}

            # Get project template_id
            proj_result = await db.execute(
                select(Project.template_id).where(Project.id == session.project_id)
            )
            template_id = proj_result.scalar_one_or_none()

            phase.status = "verifying"
            await db.commit()

            verification_result = await run_verification_checks(
                checks=checks,
                project_id=session.project_id,
                sandbox=sandbox,
                template_id=template_id,
            )

            phase.verification_result = verification_result
            phase.status = "completed" if verification_result["passed"] else "failed"
            if verification_result["passed"]:
                from datetime import datetime, timezone
                phase.completed_at = datetime.now(timezone.utc)
            await db.commit()

            # Publish event
            try:
                event_bus = EventBus(
                    session_factory=AsyncSessionLocal, redis_client=redis_client
                )
                await event_bus.startup()
                await event_bus.publish_event(
                    event_type=PLAN_VERIFICATION_COMPLETED,
                    event_data={
                        "phase_id": phase_id,
                        "session_id": str(session.id),
                        "passed": verification_result["passed"],
                        "summary": verification_result["summary"],
                    },
                    severity="info",
                    source="worker",
                )
            except Exception:
                logger.warning("Failed to publish verification event for phase %s", phase_id)

            logger.info(
                "Phase verification %s: %s",
                phase_id, verification_result["summary"],
            )
            return {
                "phase_id": phase_id,
                "status": phase.status,
                "passed": verification_result["passed"],
                "summary": verification_result["summary"],
            }

    except Exception as exc:
        logger.error("Phase verification failed for %s: %s", phase_id, exc)
        try:
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(PlanPhase).where(PlanPhase.id == phase_uuid)
                )
                phase = result.scalar_one_or_none()
                if phase:
                    phase.status = "failed"
                    phase.verification_result = {"passed": False, "results": [], "summary": f"Error: {exc}"}
                    await db.commit()
        except Exception as status_exc:
            logger.warning("Failed to mark phase %s as failed: %s", phase_id, status_exc)
        return {"phase_id": phase_id, "status": "failed", "error": str(exc)}
    finally:
        await sandbox.shutdown()
        if event_bus is not None:
            try:
                await event_bus.shutdown()
            except Exception:
                pass
        try:
            await redis_client.aclose()
        except Exception:
            pass


class WorkerSettings:
    """ARQ Worker settings."""
    redis_settings = get_redis_settings()
    functions = [
        example_task,
        ingest_kb_source_task,
        generate_embeddings_task,
        generate_image_task,
        execute_automation_action_task,
        compact_conversation_task,
        import_git_project_task,
        import_archive_project_task,
        import_website_project_task,
        verify_plan_phase_task,
        bulk_ingest_kb_task,
    ]
    max_jobs = 20
    job_timeout = 600
