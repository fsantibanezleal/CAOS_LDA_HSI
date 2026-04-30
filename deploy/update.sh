#!/usr/bin/env bash
set -euo pipefail

APP="/opt/fasl-apps/CAOS_LDA_HSI"

cd "$APP"
git fetch --all --prune
git pull --ff-only

.venv/bin/pip install -r requirements.txt
.venv-pipeline/bin/pip install -r data-pipeline/requirements.txt
.venv-pipeline/bin/python data-pipeline/build_demo.py

if command -v pnpm >/dev/null 2>&1; then
  (cd frontend && pnpm install --frozen-lockfile || pnpm install)
  (cd frontend && pnpm build)
else
  (cd frontend && npm install)
  (cd frontend && npm run build)
fi

systemctl restart fasl-lda-hsi
systemctl --no-pager --full status fasl-lda-hsi | sed -n '1,20p'
