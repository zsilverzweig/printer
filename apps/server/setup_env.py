#!/usr/bin/env python3
"""
Environment setup script for printer-server.
This script helps you set up your environment variables.
"""

import os
from pathlib import Path

def setup_environment():
    """Set up environment variables for the printer-server."""
    
    print("Setting up environment for printer-server...")
    print("=" * 50)
    
    # Check if env.local exists
    env_local_path = Path("env.local")
    if not env_local_path.exists():
        print("❌ env.local file not found. Please create it from env.template")
        return False
    
    # Load environment variables
    from dotenv import load_dotenv
    load_dotenv("env.local")
    
    # Check required environment variables
    required_vars = [
        "OPENAI_API_KEY",
        "POLYGON_API_KEY"
    ]
    
    missing_vars = []
    for var in required_vars:
        value = os.getenv(var)
        if not value or value == f"your_{var.lower()}_here":
            missing_vars.append(var)
    
    if missing_vars:
        print("❌ Missing or placeholder environment variables:")
        for var in missing_vars:
            print(f"   - {var}")
        print("\nPlease update env.local with your actual API keys.")
        return False
    
    print("✅ Environment variables are properly configured!")
    print("\nCurrent configuration:")
    for var in required_vars:
        value = os.getenv(var)
        # Mask the API key for security
        if "API_KEY" in var:
            masked_value = value[:8] + "..." + value[-4:] if len(value) > 12 else "***"
            print(f"   - {var}: {masked_value}")
        else:
            print(f"   - {var}: {value}")
    
    return True

if __name__ == "__main__":
    setup_environment()
