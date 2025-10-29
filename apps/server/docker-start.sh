#!/bin/bash
set -e

echo "🔄 Running database migrations..."
python3 run_migrations.py

if [ $? -eq 0 ]; then
    echo "✅ Migrations completed successfully"
    echo ""
    echo "🚀 Starting FastAPI server..."
    exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
else
    echo "❌ Migration failed, exiting..."
    exit 1
fi


