#!/bin/bash

# Start the printer-server with proper virtual environment activation

echo "Starting printer-server..."
echo "=========================="

# Check if virtual environment exists, create if not
if [ ! -d ".venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv .venv
    if [ $? -ne 0 ]; then
        echo "❌ Failed to create virtual environment. Please ensure python3 is installed."
        exit 1
    fi
    echo "✅ Virtual environment created"
fi

# Activate virtual environment
echo "🔧 Activating virtual environment..."
source .venv/bin/activate

# Check if requirements are installed
echo "📋 Checking dependencies..."
if ! python3 -c "import fastapi, uvicorn" 2>/dev/null; then
    echo "📦 Installing dependencies from requirements.txt..."
    pip install -r requirements.txt
    if [ $? -ne 0 ]; then
        echo "❌ Failed to install dependencies. Please check requirements.txt"
        exit 1
    fi
    echo "✅ Dependencies installed"
else
    echo "✅ Dependencies already installed"
fi

# Check if environment variables are set
if [ ! -f "env.local" ]; then
    echo "❌ env.local file not found. Please create it from env.template"
    exit 1
fi

# Verify environment setup
echo "Verifying environment setup..."
python3 setup_env.py

if [ $? -ne 0 ]; then
    echo "❌ Environment setup failed. Please fix the issues above."
    exit 1
fi

# Run database migrations
echo "🔄 Running database migrations..."
python3 run_migrations.py

if [ $? -eq 0 ]; then
    echo ""
    echo "🚀 Starting server on http://0.0.0.0:8000"
    echo "💚 WebSocket keep-alive: ENABLED (infinite timeout for local dev)"
    echo "Press Ctrl+C to stop the server"
    echo ""
    # Run with generous timeouts for local dev - keep websockets alive indefinitely
    # --ws-ping-interval 20: send ping every 20 seconds
    # --ws-ping-timeout 600: wait up to 10 minutes for pong (very generous)
    # --timeout-keep-alive 86400: keep HTTP connections alive for 24 hours
    uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 \
        --ws-ping-interval 20 \
        --ws-ping-timeout 600 \
        --timeout-keep-alive 86400
else
    echo "❌ Environment setup failed. Please fix the issues above."
    exit 1
fi
