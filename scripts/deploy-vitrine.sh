#!/usr/bin/env bash
#
# Déploiement de la vitrine lingeserein.fr en UNE commande.
#
#   ./scripts/deploy-vitrine.sh              # build + déploie + vérifie
#   ./scripts/deploy-vitrine.sh --dry-run    # build + vérifie localement, ne touche pas au serveur
#   ./scripts/deploy-vitrine.sh --rollback   # revient à la version précédente
#
# Garanties :
#   - rien n'est envoyé si le build local est vide ou incomplet ;
#   - la mise en ligne se fait par rsync --delete (fenêtre d'incohérence minimale,
#     contrairement à un rm -rf suivi d'une copie qui laisse le site cassé
#     pendant toute la copie) ;
#   - la version en ligne est vérifiée APRÈS bascule (codes HTTP + contenu réel) ;
#   - en cas d'échec de la vérification, retour arrière AUTOMATIQUE ;
#   - les 5 dernières versions sont conservées sur le serveur.
set -euo pipefail

VPS="${VPS_HOST:-root@46.224.193.109}"
LIVE="/var/www/lingeserein.fr"
RELEASES="/var/www/lingeserein-releases"
SITE="https://lingeserein.fr"
STAMP="$(date +%Y%m%d-%H%M%S)"

# Le TLS de la machine de dev passe par Norton : sans ce CA, npm échoue.
export NODE_EXTRA_CA_CERTS="${NODE_EXTRA_CA_CERTS:-/c/Users/ramzi/.certs/norton-root.pem}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/apps/vitrine/out"

log() { printf '\n\033[1m[vitrine]\033[0m %s\n' "$*"; }
fail() { printf '\n\033[31m[vitrine] ÉCHEC :\033[0m %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- rollback ---
if [ "${1:-}" = "--rollback" ]; then
  log "retour à la version précédente…"
  ssh -o BatchMode=yes "$VPS" bash -s <<'REMOTE'
set -euo pipefail
RELEASES="/var/www/lingeserein-releases"
LIVE="/var/www/lingeserein.fr"
PREV="$(ls -1dt "$RELEASES"/2* 2>/dev/null | sed -n 2p)"
[ -n "$PREV" ] || { echo "Aucune version précédente à restaurer." >&2; exit 1; }
echo "restauration de $PREV"
rsync -a --delete "$PREV"/ "$LIVE"/
REMOTE
  ssh -o BatchMode=yes "$VPS" "curl -sf -o /dev/null '$SITE/'" || fail "le site ne répond pas après retour arrière"
  log "retour arrière effectué, site en ligne."
  exit 0
fi

# ------------------------------------------------------------------- build ---
log "build de la vitrine…"
( cd "$ROOT/apps/vitrine" && npm run build >/dev/null 2>&1 ) || fail "le build a échoué"

# Garde-fou : un export vide "réussit" silencieusement. On refuse d'envoyer ça.
[ -f "$OUT/index.html" ] || fail "out/index.html absent — build incomplet"
PAGES="$(find "$OUT" -name '*.html' | wc -l | tr -d ' ')"
[ "$PAGES" -ge 5 ] || fail "seulement $PAGES page(s) HTML générée(s) — build suspect"
grep -q "Linge Serein" "$OUT/index.html" || fail "index.html ne contient pas la marque — build corrompu"

log "build OK — $PAGES pages."

if [ "${1:-}" = "--dry-run" ]; then
  log "--dry-run : rien n'a été envoyé au serveur."
  exit 0
fi

# ------------------------------------------------------------------ envoi ---
log "envoi de la version $STAMP…"
tar czf - -C "$OUT" . | ssh -o BatchMode=yes "$VPS" "
set -euo pipefail
mkdir -p '$RELEASES/$STAMP'
tar xzf - -C '$RELEASES/$STAMP'
"

# Contrôle du contenu reçu, AVANT de toucher à ce qui est en ligne.
ssh -o BatchMode=yes "$VPS" "
set -euo pipefail
[ -f '$RELEASES/$STAMP/index.html' ] || { echo 'index.html manquant côté serveur'; exit 1; }
"

# ---------------------------------------------------------------- bascule ---
log "mise en ligne…"
ssh -o BatchMode=yes "$VPS" "
set -euo pipefail
# Sauvegarde de l'état courant en tant que version, pour que --rollback la retrouve.
if [ -d '$LIVE' ] && [ -n \"\$(ls -A '$LIVE' 2>/dev/null)\" ]; then
  mkdir -p '$RELEASES/pre-$STAMP'
  rsync -a --delete '$LIVE'/ '$RELEASES/pre-$STAMP'/
fi
rsync -a --delete '$RELEASES/$STAMP'/ '$LIVE'/
"

# ------------------------------------------------------------ vérification ---
log "vérification du site en ligne…"
# La vérification s'exécute DEPUIS LE VPS, jamais depuis le poste de développement :
# l'antivirus de la machine Windows intercepte le TLS et fait échouer curl (code 000)
# alors que le site répond parfaitement. Vérifier en local revenait à déclencher un
# retour arrière sur une fausse panne — c'est exactement ce qui s'est produit au
# premier essai de ce script.
# /contrat est ATTENDU en 401 : le générateur de contrat est protégé par auth_basic
# côté nginx depuis le durcissement du 2026-07-30. Exiger 200 déclenchait un retour
# arrière alors que la protection fonctionnait — la vérification doit contrôler ce
# qu'on veut aujourd'hui, pas ce qu'on voulait avant.
verifier_distant() {
  ssh -o BatchMode=yes "$VPS" \
    "ko=''; \
     for p in / /tarifs /zone-de-livraison; do \
       c=\$(curl -s -o /dev/null -w '%{http_code}' '$SITE'\$p || echo 000); \
       echo \"  \$p -> \$c\" >&2; \
       [ \"\$c\" = 200 ] || ko=\"\$ko \$p(\$c)\"; \
     done; \
     c=\$(curl -s -o /dev/null -w '%{http_code}' '$SITE/contrat' || echo 000); \
     echo \"  /contrat -> \$c (401 attendu : auth_basic)\" >&2; \
     [ \"\$c\" = 401 ] || ko=\"\$ko /contrat(\$c-au-lieu-de-401)\"; \
     curl -s '$SITE/' | grep -q 'Linge Serein' || ko=\"\$ko contenu-accueil\"; \
     printf '%s' \"\$ko\""
}

ECHEC="$(verifier_distant)"

if [ -n "$ECHEC" ]; then
  log "vérification ÉCHOUÉE ($ECHEC) — retour arrière automatique…"
  ssh -o BatchMode=yes "$VPS" "
set -euo pipefail
[ -d '$RELEASES/pre-$STAMP' ] && rsync -a --delete '$RELEASES/pre-$STAMP'/ '$LIVE'/
"
  if ssh -o BatchMode=yes "$VPS" "curl -sf -o /dev/null '$SITE/'"; then
    log "version précédente rétablie, site en ligne."
  else
    log "ATTENTION : le site ne répond toujours pas — intervention manuelle nécessaire."
  fi
  fail "déploiement annulé, rien n'a été laissé en place."
fi

# --------------------------------------------------------------- rétention ---
ssh -o BatchMode=yes "$VPS" "
set -euo pipefail
ls -1dt '$RELEASES'/2* 2>/dev/null | tail -n +6 | xargs -r rm -rf
ls -1dt '$RELEASES'/pre-* 2>/dev/null | tail -n +4 | xargs -r rm -rf
"

log "déployé et vérifié — version $STAMP en ligne."
log "retour arrière si besoin : ./scripts/deploy-vitrine.sh --rollback"
