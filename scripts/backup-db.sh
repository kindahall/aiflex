#!/usr/bin/env bash
# AiFlex PostgreSQL backup (V8 §B7.4).
#
# Runs pg_dump, encrypts with GPG (public key recipient), uploads to S3-compatible
# storage via `aws s3 cp`, and prunes old backups beyond retention.
#
# Prerequisites:
#   - pg_dump on PATH (matching the server's Postgres version)
#   - gpg with the recipient key imported
#   - awscli configured with creds for the backup bucket
#     (separate from S3_* runtime creds — the app must NOT have delete rights here)
#
# Env vars (required):
#   DATABASE_URL              full Postgres connection string
#   BACKUP_GPG_RECIPIENT      email/key id of the GPG recipient
#   BACKUP_BUCKET             e.g. s3://aiflex-backups
#   BACKUP_RETENTION_DAYS     default 30
#
# Schedule via system crontab (NOT via node-cron — this should run even if the
# app is down):
#   0 3 * * * /home/deploy/aiflex/scripts/backup-db.sh >> /var/log/aiflex-backup.log 2>&1

set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_GPG_RECIPIENT:?BACKUP_GPG_RECIPIENT is required}"
: "${BACKUP_BUCKET:?BACKUP_BUCKET is required}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

STAMP=$(date -u +"%Y%m%d_%H%M%S")
WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

DUMP_FILE="$WORKDIR/aiflex_${STAMP}.sql"
ENCRYPTED_FILE="$DUMP_FILE.gpg"

echo "[backup] $(date -u +"%FT%TZ") → dumping to $DUMP_FILE"
pg_dump --format=custom --no-owner --no-privileges \
  --file="$DUMP_FILE" "$DATABASE_URL"

SIZE=$(du -h "$DUMP_FILE" | cut -f1)
echo "[backup] dump complete ($SIZE) → encrypting"

gpg --batch --yes --trust-model always \
  --output "$ENCRYPTED_FILE" \
  --encrypt --recipient "$BACKUP_GPG_RECIPIENT" \
  "$DUMP_FILE"

echo "[backup] encrypted → uploading to $BACKUP_BUCKET"
aws s3 cp "$ENCRYPTED_FILE" "$BACKUP_BUCKET/backups/$(basename "$ENCRYPTED_FILE")" \
  --only-show-errors

echo "[backup] uploaded → pruning backups older than $RETENTION_DAYS days"
# Calculate the cutoff date portably (macOS + Linux date have different flags)
if date -v-1d >/dev/null 2>&1; then
  CUTOFF=$(date -v-"${RETENTION_DAYS}"d -u +"%Y-%m-%d")
else
  CUTOFF=$(date -u -d "$RETENTION_DAYS days ago" +"%Y-%m-%d")
fi

aws s3 ls "$BACKUP_BUCKET/backups/" | while IFS= read -r line; do
  FILE_DATE=$(echo "$line" | awk '{print $1}')
  FILE_NAME=$(echo "$line" | awk '{print $4}')
  if [[ -z "$FILE_NAME" ]]; then continue; fi
  if [[ "$FILE_DATE" < "$CUTOFF" ]]; then
    echo "[backup] pruning $FILE_NAME (from $FILE_DATE)"
    aws s3 rm "$BACKUP_BUCKET/backups/$FILE_NAME" --only-show-errors
  fi
done

echo "[backup] $(date -u +"%FT%TZ") done"
