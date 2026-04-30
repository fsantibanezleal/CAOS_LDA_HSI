#!/usr/bin/env bash
set -euo pipefail

APP="/opt/fasl-apps/CAOS_LDA_HSI"
PORT="8105"

cd "$APP"

git fetch --all --prune
if [ -n "$(git status --porcelain)" ]; then
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  git stash push --include-untracked -m "pre-lda-hsi-deploy-$stamp"
fi
git pull --ff-only

.venv/bin/pip install -r requirements.txt

if [ -f frontend/package-lock.json ]; then
  (cd frontend && npm ci && npm run build)
elif command -v pnpm >/dev/null 2>&1; then
  (cd frontend && pnpm install --frozen-lockfile && pnpm build)
else
  (cd frontend && npm install && npm run build)
fi

systemctl restart fasl-lda-hsi
sleep 2
curl -fsS "http://127.0.0.1:$PORT/healthz" >/dev/null
bash scripts/smoke.sh "http://127.0.0.1:$PORT"
systemctl --no-pager --full status fasl-lda-hsi | sed -n '1,20p'
