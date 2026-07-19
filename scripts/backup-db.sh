#!/usr/bin/env bash
# Sauvegarde de la base de production Linge Serein.
#
# À lancer AVANT toute migration. Le format custom (-Fc) permet une restauration
# sélective (pg_restore -t table) et compresse ; un dump SQL simple ne le permet pas.
#
#   ./scripts/backup-db.sh                  # dump horodaté dans /opt/backups
#   ./scripts/backup-db.sh --verify         # dump PUIS restauration test sur une base jetable
#
# Un dump jamais restauré n'est pas une sauvegarde : --verify le prouve réellement.
set -euo pipefail

CONTAINER="${PG_CONTAINER:-ls-postgres}"
DB="${PG_DB:-lingeserein}"
USER="${PG_USER:-lingeserein}"
DEST_DIR="${BACKUP_DIR:-/opt/backups}"
STAMP="$(date +%F-%H%M%S)"
DUMP="ls-${STAMP}.dump"

mkdir -p "$DEST_DIR"

echo "[backup] dump de ${DB} depuis ${CONTAINER}..."
docker exec "$CONTAINER" pg_dump -U "$USER" -d "$DB" -Fc -f "/tmp/${DUMP}"
docker cp "${CONTAINER}:/tmp/${DUMP}" "${DEST_DIR}/${DUMP}"
docker exec "$CONTAINER" rm -f "/tmp/${DUMP}"

SIZE="$(du -h "${DEST_DIR}/${DUMP}" | cut -f1)"
echo "[backup] OK : ${DEST_DIR}/${DUMP} (${SIZE})"

# Un dump de quelques centaines d'octets est un dump vide qui a "réussi".
BYTES="$(stat -c%s "${DEST_DIR}/${DUMP}")"
if [ "$BYTES" -lt 10000 ]; then
  echo "[backup] ERREUR : dump suspicieusement petit (${BYTES} octets)" >&2
  exit 1
fi

if [ "${1:-}" = "--verify" ]; then
  TESTDB="restore_test_${STAMP//-/_}"
  echo "[verify] restauration dans la base jetable ${TESTDB}..."
  docker cp "${DEST_DIR}/${DUMP}" "${CONTAINER}:/tmp/${DUMP}"
  docker exec "$CONTAINER" psql -U "$USER" -d postgres -c "DROP DATABASE IF EXISTS \"${TESTDB}\";"
  docker exec "$CONTAINER" psql -U "$USER" -d postgres -c "CREATE DATABASE \"${TESTDB}\";"

  # --exit-on-error : sans lui pg_restore signale les erreurs mais sort en 0,
  # et on croirait la restauration réussie.
  docker exec "$CONTAINER" pg_restore -U "$USER" -d "${TESTDB}" --exit-on-error "/tmp/${DUMP}"

  echo "[verify] contrôle du contenu restauré :"
  docker exec "$CONTAINER" psql -U "$USER" -d "${TESTDB}" -c \
    "SELECT 'users' t, count(*) FROM users
     UNION ALL SELECT 'orders', count(*) FROM orders
     UNION ALL SELECT 'quotes', count(*) FROM quotes
     UNION ALL SELECT 'notifications', count(*) FROM notifications;"

  docker exec "$CONTAINER" psql -U "$USER" -d postgres -c "DROP DATABASE \"${TESTDB}\";"
  docker exec "$CONTAINER" rm -f "/tmp/${DUMP}"
  echo "[verify] restauration VALIDÉE, base de test supprimée."
fi

# Rétention : 10 dumps les plus récents.
ls -1t "${DEST_DIR}"/ls-*.dump 2>/dev/null | tail -n +11 | xargs -r rm -f
echo "[backup] terminé."
