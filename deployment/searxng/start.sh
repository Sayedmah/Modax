#!/bin/sh
set -eu
: "${MODAX_SEARCH_TOKEN:?MODAX_SEARCH_TOKEN is required}"
export SEARXNG_SECRET="$MODAX_SEARCH_TOKEN"
export GRANIAN_HOST=0.0.0.0
export GRANIAN_PORT="${PORT:-8080}"
exec /usr/local/searxng/.venv/bin/granian modax_search_app:application
