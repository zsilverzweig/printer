#!/bin/bash
set -e

# Run migrations (script will print its own status messages)
python3 run_migrations.py
exit_code=$?

if [ $exit_code -eq 0 ]; then
    echo ""
    echo "🚀 Starting FastAPI server..."

    # Allow hot-reload to be toggled via environment (default off in Docker)
    UVICORN_RELOAD_FLAG=""
    if [ "${UVICORN_RELOAD:-false}" = "true" ]; then
        echo "🔁 UVicorn reload enabled"
        UVICORN_RELOAD_FLAG="--reload"
    fi

    exec uvicorn app.main:app --host 0.0.0.0 --port 8000 ${UVICORN_RELOAD_FLAG}
else
    echo "❌ Migration failed, exiting..."
    exit $exit_code
fi


