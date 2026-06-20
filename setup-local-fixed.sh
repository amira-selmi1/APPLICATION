#!/usr/bin/env bash
# ============================================================
# Setup automatique de l'environnement local
# ------------------------------------------------------------
# Ce script :
#   1. Clone le repo officiel supabase/docker (si absent)
#   2. Génère un .env avec des secrets aléatoires (JWT, ANON_KEY, SERVICE_ROLE_KEY)
#   3. Démarre la stack Supabase via docker compose
#   4. Applique toutes les migrations SQL de l'app
#   5. Génère le .env de l'app à la racine
#
# Prérequis : Docker Desktop, openssl, node (pour générer les JWT), psql
# Usage :    bash scripts/setup-local.sh
# ============================================================
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SUPABASE_DIR="$ROOT/.local-supabase"
DB_PASSWORD="${DB_PASSWORD:-postgres_local_$(openssl rand -hex 4)}"
JWT_SECRET="${JWT_SECRET:-$(openssl rand -hex 32)}"
echo "==> Dossier projet : $ROOT"
echo "==> Stack Supabase : $SUPABASE_DIR"
# 1. Cloner supabase/docker
if [ ! -d "$SUPABASE_DIR" ]; then
  echo "==> Clonage de supabase/docker..."
  git clone --depth 1 https://github.com/supabase/supabase "$SUPABASE_DIR/_repo"
  mkdir -p "$SUPABASE_DIR"
  cp -r "$SUPABASE_DIR/_repo/docker/." "$SUPABASE_DIR/"
  rm -rf "$SUPABASE_DIR/_repo"
fi
cd "$SUPABASE_DIR"
# 2. Générer les JWT (ANON_KEY + SERVICE_ROLE_KEY) avec node
if [ ! -f .env ]; then
  echo "==> Génération des clés JWT..."
  cp .env.example .env
  KEYS=$(node -e "
    const crypto = require('crypto');
    const secret = process.argv[1];
    function b64(o){return Buffer.from(JSON.stringify(o)).toString('base64url');}
    function jwt(role){
      const h = b64({alg:'HS256',typ:'JWT'});
      const p = b64({role, iss:'supabase-demo', iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000) + 60*60*24*365*10});
      const s = crypto.createHmac('sha256', secret).update(h+'.'+p).digest('base64url');
      return h+'.'+p+'.'+s;
    }
    console.log(jwt('anon'));
    console.log(jwt('service_role'));
  " "$JWT_SECRET")
  ANON_KEY=$(echo "$KEYS" | sed -n 1p)
  SERVICE_ROLE_KEY=$(echo "$KEYS" | sed -n 2p)
  # Patch .env
  sed -i.bak "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$DB_PASSWORD|"     .env
  sed -i.bak "s|^JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|"                     .env
  sed -i.bak "s|^ANON_KEY=.*|ANON_KEY=$ANON_KEY|"                           .env
  sed -i.bak "s|^SERVICE_ROLE_KEY=.*|SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY|"   .env
  sed -i.bak "s|^DASHBOARD_USERNAME=.*|DASHBOARD_USERNAME=admin|"           .env
  sed -i.bak "s|^DASHBOARD_PASSWORD=.*|DASHBOARD_PASSWORD=admin|"           .env
  rm -f .env.bak
  echo "    POSTGRES_PASSWORD = $DB_PASSWORD"
  echo "    JWT_SECRET        = $JWT_SECRET"
  echo "    ANON_KEY          = $ANON_KEY"
fi
ANON_KEY=$(grep ^ANON_KEY= .env | cut -d= -f2-)
DB_PASSWORD=$(grep ^POSTGRES_PASSWORD= .env | cut -d= -f2-)
# 3. Démarrer la stack
echo "==> Démarrage de la stack Supabase (docker compose up -d)..."
docker compose pull
docker compose up -d
echo "==> Attente que Postgres soit prêt..."
for i in $(seq 1 60); do
  if docker compose exec -T db pg_isready -U postgres >/dev/null 2>&1; then
    echo "    Postgres OK"
    break
  fi
  sleep 2
done
# 4. Appliquer les migrations
echo "==> Application des migrations SQL..."
cd "$ROOT"
export PGPASSWORD="$DB_PASSWORD"
for f in supabase/migrations/*.sql; do
  echo "    -> $(basename "$f")"
  psql "postgresql://postgres@localhost:5432/postgres" -v ON_ERROR_STOP=1 -f "$f" >/dev/null || {
    echo "    !! Échec sur $f — vérifie le SQL ou applique-le manuellement via Studio (http://localhost:8000)"
  }
done
# 5. Générer le .env de l'app
echo "==> Écriture de .env (racine de l'app)..."
cat > "$ROOT/.env" <<EOF
VITE_SUPABASE_URL=http://localhost:8000
VITE_SUPABASE_PUBLISHABLE_KEY=$ANON_KEY
VITE_SUPABASE_PROJECT_ID=local
EOF
echo ""
echo "============================================================"
echo "  ✅ Setup local terminé !"
echo "------------------------------------------------------------"
echo "  Studio Supabase : http://localhost:8000   (admin / admin)"
echo "  Postgres        : postgres://postgres:$DB_PASSWORD@localhost:5432/postgres"
echo ""
echo "  Lance l'app :   npm install && npm run dev"
echo "  Premier inscrit sur /auth → devient admin automatiquement."
echo "============================================================"
