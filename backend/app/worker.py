import os
from arq import create_pool
from arq.connections import RedisSettings


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


class WorkerSettings:
    """ARQ Worker settings."""
    redis_settings = get_redis_settings()
    functions = [example_task]
    max_jobs = 10
    job_timeout = 300
