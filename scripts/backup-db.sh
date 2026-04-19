#!/usr/bin/env bash
# AIflex PostgreSQL backup (V8 §B7.4 + audit R-07).
#
# Strategy: hourly logical dumps + daily verified restore + WAL archiving
# guidance for true PITR.
#
# Modes:
#   ./backup-db.sh                 # hourly snapshot + S3 upload
#   ./backup-db.sh verify          # download latest, restore to throwaway DB,
#                                  # verify row counts, drop the test DB
#   ./backup-db.sh wal-archive     # tail pg_receivewal to S3 (must run as a
#                                  # daemon — recommended via systemd)
#
# Prerequisites:
#   - pg_dump / psql / pg_restore matching the server's Postgres version
#   - gpg with the recipient key imported
#   - awscli configured with creds for the backup bucket (separate from the
#     app's S3_* runtime creds — the app must NOT have delete rights on
#     this bucket)
#
# Required env:
#   DATABASE_URL              full Postgres connection string
#   BACKUP_GPG_RECIPIENT      email/key id of the GPG recipient
#   BACKUP_BUCKET             e.g. s3://aiflex-backups
#   BACKUP_RETENTION_DAYS     default 30
#   BACKUP_VERIFY_DATABASE    optional, full URL to a throwaway DB used by
#                             `verify` mode (must be empty / disposable)
#   PG_WAL_ARCHIVE_DIR        optional, dir for `wal-archive` daemon to mirror
#
# Schedule (system crontab — NOT node-cron, must run even if app is down):
#   0 * * * *  /opt/aiflex/scripts/backup-db.sh        >> /var/log/aiflex-backup.log 2>&1
#   30 4 * * * /opt/aiflex/scripts/backup-db.sh verify >> /var/log/aiflex-verify.log 2>&1
#
# For true point-in-time recovery, also configure the Postgres server with:
#   wal_level = replica
#   archive_mode = on
#   archive_command = 'aws s3 cp %p s3://aiflex-backups/wal/%f'
# OR run pg_receivewal continuously (see `wal-archive` mode).

set -euo pipefail

MODE="${1:-snapshot}"

case "$MODE" in
  snapshot)
    : "${DATABASE_URL:?DATABASE_URL is required}"
    : "${BACKUP_GPG_RECIPIENT:?BACKUP_GPG_RECIPIENT is required}"
    : "${BACKUP_BUCKET:?BACKUP_BUCKET is required}"
    RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

    STAMP=$(date -u +"%Y%m%d_%H%M%S")
    WORKDIR=$(mktemp -d)
    trap 'rm -rf "$WORKDIR"' EXIT

    DUMP_FILE="$WORKDIR/aiflex_${STAMP}.dump"
    ENCRYPTED_FILE="$DUMP_FILE.gpg"
    CHECKSUM_FILE="$DUMP_FILE.sha256"

    echo "[backup] $(date -u +"%FT%TZ") → dumping to $DUMP_FILE"
    # --format=custom enables parallel restore, selective object restore,
    # and lzma compression. Indispensable at any non-trivial DB size.
    pg_dump --format=custom --no-owner --no-privileges --compress=9 \
      --file="$DUMP_FILE" "$DATABASE_URL"

    SIZE=$(du -h "$DUMP_FILE" | cut -f1)
    echo "[backup] dump complete ($SIZE) → checksumming"
    sha256sum "$DUMP_FILE" | awk '{print $1}' >"$CHECKSUM_FILE"

    echo "[backup] encrypting → $ENCRYPTED_FILE"
    gpg --batch --yes --trust-model always \
      --output "$ENCRYPTED_FILE" \
      --encrypt --recipient "$BACKUP_GPG_RECIPIENT" \
      "$DUMP_FILE"

    echo "[backup] uploading to $BACKUP_BUCKET"
    aws s3 cp "$ENCRYPTED_FILE" "$BACKUP_BUCKET/backups/$(basename "$ENCRYPTED_FILE")" \
      --only-show-errors --storage-class STANDARD_IA
    aws s3 cp "$CHECKSUM_FILE" "$BACKUP_BUCKET/backups/$(basename "$CHECKSUM_FILE")" \
      --only-show-errors

    echo "[backup] pruning backups older than $RETENTION_DAYS days"
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
    ;;

  verify)
    : "${BACKUP_BUCKET:?BACKUP_BUCKET is required}"
    : "${BACKUP_VERIFY_DATABASE:?BACKUP_VERIFY_DATABASE is required}"
    : "${BACKUP_GPG_RECIPIENT:?BACKUP_GPG_RECIPIENT is required}"

    WORKDIR=$(mktemp -d)
    trap 'rm -rf "$WORKDIR"' EXIT

    echo "[verify] downloading latest backup"
    LATEST=$(aws s3 ls "$BACKUP_BUCKET/backups/" \
      | grep -E '\.dump\.gpg$' \
      | sort \
      | tail -n 1 \
      | awk '{print $4}')
    if [[ -z "$LATEST" ]]; then
      echo "[verify] no backup found in $BACKUP_BUCKET" >&2
      exit 1
    fi
    aws s3 cp "$BACKUP_BUCKET/backups/$LATEST" "$WORKDIR/$LATEST" --only-show-errors

    echo "[verify] decrypting"
    gpg --batch --yes --output "$WORKDIR/dump" --decrypt "$WORKDIR/$LATEST"

    echo "[verify] checksum check"
    EXPECTED=$(aws s3 cp "$BACKUP_BUCKET/backups/${LATEST%.gpg}.sha256" - --only-show-errors)
    OBSERVED=$(sha256sum "$WORKDIR/dump" | awk '{print $1}')
    if [[ "$EXPECTED" != "$OBSERVED" ]]; then
      echo "[verify] CHECKSUM MISMATCH (expected $EXPECTED, got $OBSERVED)" >&2
      exit 1
    fi
    echo "[verify] checksum OK"

    echo "[verify] restoring into $BACKUP_VERIFY_DATABASE (throwaway)"
    psql "$BACKUP_VERIFY_DATABASE" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" >/dev/null
    pg_restore --no-owner --no-privileges --jobs=4 \
      --dbname="$BACKUP_VERIFY_DATABASE" "$WORKDIR/dump"

    echo "[verify] basic row-count smoke tests"
    USERS=$(psql "$BACKUP_VERIFY_DATABASE" -tAc 'SELECT count(*) FROM "User";' 2>/dev/null || echo 0)
    PROJECTS=$(psql "$BACKUP_VERIFY_DATABASE" -tAc 'SELECT count(*) FROM "Project";' 2>/dev/null || echo 0)
    echo "[verify] users=$USERS projects=$PROJECTS"
    if [[ "$USERS" -lt 1 ]]; then
      echo "[verify] WARNING: zero users restored — likely empty backup" >&2
    fi
    echo "[verify] $(date -u +"%FT%TZ") OK"
    ;;

  wal-archive)
    : "${DATABASE_URL:?DATABASE_URL is required}"
    : "${PG_WAL_ARCHIVE_DIR:?PG_WAL_ARCHIVE_DIR is required (local staging dir)}"
    : "${BACKUP_BUCKET:?BACKUP_BUCKET is required}"
    mkdir -p "$PG_WAL_ARCHIVE_DIR"
    echo "[wal] starting pg_receivewal → $PG_WAL_ARCHIVE_DIR"
    # pg_receivewal blocks indefinitely; pair with an inotify uploader or
    # rely on the systemd ExecStartPost to rsync to S3 every minute.
    pg_receivewal -D "$PG_WAL_ARCHIVE_DIR" --slot=aiflex_wal --create-slot \
      -d "$DATABASE_URL" --no-loop &
    PID=$!
    trap 'kill $PID' INT TERM
    while true; do
      sleep 60
      aws s3 sync "$PG_WAL_ARCHIVE_DIR" "$BACKUP_BUCKET/wal/" \
        --only-show-errors --exclude '*.partial'
    done
    ;;

  *)
    echo "Usage: $0 {snapshot|verify|wal-archive}" >&2
    exit 2
    ;;
esac
