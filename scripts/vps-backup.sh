#!/usr/bin/env bash
# Dump SQLite Youri + rotation 14 jours. Lancé par cron quotidiennement sur le
# VPS. Cohabite avec le backup KN dans /home/stan/backups (préfixe distinct
# `youri-` → la rotation de chaque app ne touche que ses propres dumps).
# Installation : scp ce fichier vers /home/stan/backups/youri-backup.sh
#                + chmod +x, puis crontab (ex. 3h15 UTC).
set -euo pipefail

DB_PATH="/home/stan/youri/prisma/prod.db"
BACKUP_DIR="/home/stan/backups"
KEEP_DAYS=14
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
TARGET="$BACKUP_DIR/youri-$TIMESTAMP.db"

# .backup garantit un dump cohérent même si l'app écrit en parallèle (WAL).
sqlite3 "$DB_PATH" ".backup '$TARGET'"

# Compression gzip pour économiser l'espace
gzip "$TARGET"

# Rotation : supprime les dumps Youri > KEEP_DAYS (n'affecte pas les `prod-*`
# de KN).
find "$BACKUP_DIR" -name "youri-*.db.gz" -type f -mtime +$KEEP_DAYS -delete

echo "[$(date -Iseconds)] Backup Youri OK: $TARGET.gz ($(du -h "$TARGET.gz" | cut -f1))"
