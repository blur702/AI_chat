#!/bin/bash
# Automated PostgreSQL backup script
# Runs every 4 hours, keeps only the latest 5 backups
# Usage: bash backend/scripts/db_backup.sh

BACKUP_DIR="d:/AICHAT/backups"
CONTAINER="workstation-postgres"
DB_NAME="workstation"
DB_USER="workstation_user"
MAX_BACKUPS=5
INTERVAL_SECONDS=14400  # 4 hours

mkdir -p "$BACKUP_DIR"

do_backup() {
    TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
    BACKUP_FILE="${BACKUP_DIR}/workstation_${TIMESTAMP}.sql.gz"

    echo "[$(date)] Starting backup -> ${BACKUP_FILE}"

    docker exec "$CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$BACKUP_FILE"

    if [ $? -eq 0 ] && [ -s "$BACKUP_FILE" ]; then
        echo "[$(date)] Backup complete: $(du -h "$BACKUP_FILE" | cut -f1)"
    else
        echo "[$(date)] ERROR: Backup failed or empty"
        rm -f "$BACKUP_FILE"
        return 1
    fi

    # Prune old backups, keep only latest MAX_BACKUPS
    BACKUP_COUNT=$(ls -1 "${BACKUP_DIR}"/workstation_*.sql.gz 2>/dev/null | wc -l)
    if [ "$BACKUP_COUNT" -gt "$MAX_BACKUPS" ]; then
        REMOVE_COUNT=$((BACKUP_COUNT - MAX_BACKUPS))
        echo "[$(date)] Pruning ${REMOVE_COUNT} old backup(s)"
        ls -1t "${BACKUP_DIR}"/workstation_*.sql.gz | tail -n "$REMOVE_COUNT" | xargs rm -f
    fi

    echo "[$(date)] Backups on disk: $(ls -1 "${BACKUP_DIR}"/workstation_*.sql.gz 2>/dev/null | wc -l)/${MAX_BACKUPS}"
}

# Run first backup immediately, then loop
while true; do
    do_backup
    echo "[$(date)] Next backup in 4 hours"
    sleep "$INTERVAL_SECONDS"
done
