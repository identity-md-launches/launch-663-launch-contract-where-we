#!/usr/bin/env bash
# Installs frontend dependencies outside the repository; keeps the submission clean.
set -euo pipefail
site_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
site_stage=$(mktemp -d /tmp/paid-vote-build.XXXXXX)
trap 'rm -rf -- "$site_stage"' EXIT
mkdir -p "$site_stage/web"
cp "$site_root/web/package.json" "$site_root/web/package-lock.json" "$site_root/web/tsconfig.json" "$site_root/web/vite.config.ts" "$site_root/web/index.html" "$site_stage/web/"
cp -R "$site_root/web/src" "$site_root/web/public" "$site_root/web/tests" "$site_stage/web/"
npm ci --prefix "$site_stage/web" --cache "$site_stage/npm-cache" --no-audit --no-fund
npm run typecheck --prefix "$site_stage/web"
node --test "$site_stage/web/tests/codec.test.mjs"
npm run build --prefix "$site_stage/web"
python3 - "$site_stage/dist" "$site_root/dist" <<'PY'
import shutil,sys
from pathlib import Path
source, target = map(Path, sys.argv[1:])
if not (source / 'index.html').is_file():
    raise SystemExit('Build has no index.html; existing export preserved')
if target.exists():
    shutil.rmtree(target)
shutil.copytree(source, target)
PY
python3 "$site_root/web/scripts/check-export.py"
