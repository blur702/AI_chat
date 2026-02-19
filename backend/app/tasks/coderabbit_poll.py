"""ARQ task to poll for CodeRabbit reviews on fix-branch PRs."""

import logging
import os
import subprocess

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.models.issue import Issue

logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "")
GITHUB_REPO = os.getenv("GITHUB_REPO", "")

_MAX_RETRIES = 6
_BACKOFF_SCHEDULE = [60, 300, 900, 1800, 1800, 1800]  # seconds


def _run_gh(*args: str, timeout: int = 30) -> str:
    """Run a gh CLI command and return stdout."""
    result = subprocess.run(  # noqa: S603
        ["gh", *args],  # noqa: S607
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    if result.returncode != 0:
        raise RuntimeError(f"gh {' '.join(args)} failed: {result.stderr.strip()}")
    return result.stdout.strip()


async def poll_coderabbit_review(ctx: dict, issue_id: str, retry: int = 0) -> dict:
    """Poll GitHub for a PR on the fix branch and look for CodeRabbit review comments.

    Enqueued after start_fix or when fix_pr_url is set. Re-enqueues with
    exponential backoff if CodeRabbit hasn't commented yet.
    """

    if not GITHUB_REPO:
        return {"status": "skipped", "reason": "GITHUB_REPO not configured"}

    # Create a one-off DB session
    engine = create_async_engine(DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        async with async_session() as db:
            result = await db.execute(
                select(Issue).where(
                    Issue.id == issue_id,
                    Issue.is_deleted == False,  # noqa: E712
                )
            )
            issue = result.scalar_one_or_none()
            if issue is None:
                return {"status": "skipped", "reason": "issue not found"}

            fix_branch = issue.fix_branch
            if not fix_branch:
                return {"status": "skipped", "reason": "no fix_branch set"}

            # Step 1: Find PR for this branch
            pr_url = issue.fix_pr_url
            if not pr_url:
                try:
                    pr_json = _run_gh(
                        "pr",
                        "list",
                        "--repo",
                        GITHUB_REPO,
                        "--head",
                        fix_branch,
                        "--json",
                        "url",
                        "--limit",
                        "1",
                    )
                    import json

                    prs = json.loads(pr_json)
                    if prs:
                        pr_url = prs[0]["url"]
                        issue.fix_pr_url = pr_url
                        await db.commit()
                        logger.info("Linked PR %s to issue %s", pr_url, issue_id)
                except Exception as e:
                    logger.warning("Failed to find PR for branch %s: %s", fix_branch, e)

            if not pr_url:
                # No PR yet — re-enqueue if under retry limit
                if retry < _MAX_RETRIES:
                    delay = _BACKOFF_SCHEDULE[min(retry, len(_BACKOFF_SCHEDULE) - 1)]
                    pool = ctx.get("redis")
                    if pool:
                        await pool.enqueue_job(
                            "poll_coderabbit_review",
                            issue_id,
                            retry + 1,
                            _defer_by=delay,
                            _job_id=f"coderabbit-{issue_id}-{retry + 1}",
                        )
                        logger.info(
                            "Re-enqueued coderabbit poll for %s (retry %d, delay %ds)",
                            issue_id,
                            retry + 1,
                            delay,
                        )
                    return {"status": "waiting_for_pr", "retry": retry}
                return {"status": "gave_up", "reason": "no PR found after max retries"}

            # Step 2: Check for CodeRabbit bot comment
            if not issue.coderabbit_review_url:
                try:
                    # Extract PR number from URL
                    pr_number = pr_url.rstrip("/").split("/")[-1]
                    comments_json = _run_gh(
                        "pr",
                        "view",
                        pr_number,
                        "--repo",
                        GITHUB_REPO,
                        "--json",
                        "comments",
                    )
                    import json

                    data = json.loads(comments_json)
                    comments = data.get("comments", [])
                    for comment in comments:
                        author = comment.get("author", {}).get("login", "")
                        if author == "coderabbitai[bot]" or author == "coderabbitai":
                            # Use the PR URL as the review URL (CodeRabbit comments inline)
                            issue.coderabbit_review_url = pr_url
                            await db.commit()
                            logger.info("Found CodeRabbit review for issue %s", issue_id)
                            return {"status": "found", "review_url": pr_url}
                except Exception as e:
                    logger.warning("Failed to check CodeRabbit comments: %s", e)

                # Not found yet — re-enqueue
                if retry < _MAX_RETRIES:
                    delay = _BACKOFF_SCHEDULE[min(retry, len(_BACKOFF_SCHEDULE) - 1)]
                    pool = ctx.get("redis")
                    if pool:
                        await pool.enqueue_job(
                            "poll_coderabbit_review",
                            issue_id,
                            retry + 1,
                            _defer_by=delay,
                            _job_id=f"coderabbit-{issue_id}-{retry + 1}",
                        )
                        logger.info(
                            "Re-enqueued coderabbit poll for %s (retry %d, delay %ds)",
                            issue_id,
                            retry + 1,
                            delay,
                        )
                    return {"status": "waiting_for_review", "retry": retry}
                return {"status": "gave_up", "reason": "no CodeRabbit review after max retries"}

            return {"status": "already_linked", "review_url": issue.coderabbit_review_url}
    finally:
        await engine.dispose()
