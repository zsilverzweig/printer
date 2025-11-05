#!/bin/bash
set -e

# Run migrations (script will print its own status messages)
python3 run_migrations.py
exit_code=$?

if [ $exit_code -eq 0 ]; then
    echo ""
    echo "🚀 Starting FastAPI server..."
    exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
else
    echo "❌ Migration failed, exiting..."
    exit $exit_code
fi


