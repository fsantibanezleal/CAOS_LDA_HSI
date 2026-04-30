#!/usr/bin/env bash
set -euo pipefail

SLUG="lda-hsi"
REPO="CAOS_LDA_HSI"
DOMAIN="lda-hsi.fasl-work.com"
PORT="8105"
APP="/opt/fasl-apps/$REPO"

git clone "https://github.com/fsantibanezleal/$REPO.git" "$APP"
cd "$APP"

python3 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt

if [ -f frontend/package-lock.json ]; then
  (cd frontend && npm ci && npm run build)
elif command -v pnpm >/dev/null 2>&1; then
  (cd frontend && pnpm install --frozen-lockfile && pnpm build)
else
  (cd frontend && npm install && npm run build)
fi

openssl rand -hex 32 | xargs -I{} echo "APP_SECRET={}" > "/etc/fasl-$SLUG.env"
chmod 600 "/etc/fasl-$SLUG.env"

cp "deploy/fasl-$SLUG.service" "/etc/systemd/system/"
systemctl daemon-reload
systemctl enable --now "fasl-$SLUG"

cp "deploy/$DOMAIN.nginx" "/etc/nginx/sites-available/$DOMAIN"
ln -sf "/etc/nginx/sites-available/$DOMAIN" "/etc/nginx/sites-enabled/$DOMAIN"
nginx -t && systemctl reload nginx

certbot --nginx -d "$DOMAIN" \
  --non-interactive --agree-tos -m fsantibanez@gmail.com --redirect

curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:$PORT/healthz"
curl -s -o /dev/null -w "%{http_code}\n" "https://$DOMAIN/healthz"
