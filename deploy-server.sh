#!/usr/bin/env bash
set -euo pipefail

cd "/home/ubuntu/stremio.sosac"

if [[ "$(git branch --show-current)" != "Master" ]]; then
  echo "Refusing deploy: expected branch Master."
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Refusing deploy: tracked local changes are present."
  git status --short
  exit 1
fi

git fetch origin "Master"

read -r ahead behind < <(git rev-list --left-right --count HEAD...origin/Master)
if [[ "$ahead" != "0" ]]; then
  echo "Refusing deploy: server has $ahead local commit(s) not on GitHub."
  exit 1
fi

git merge --ff-only "origin/Master"

npm ci --omit=dev --no-audit --no-fund
node --check addon.js

pm2 restart "stremio-sosac" --update-env
pm2 save

curl --retry 15 --retry-delay 1 --retry-connrefused -fsS http://127.0.0.1:7000/health >/dev/null

echo "stremio-sosac deployed successfully from Master."
