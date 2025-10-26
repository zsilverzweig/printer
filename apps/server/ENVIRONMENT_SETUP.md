# Environment Setup for Printer Server

This document explains how to set up environment variables for the printer-server.

## Quick Setup

1. **Copy the environment template:**

   ```bash
   cp env.template env.local
   ```

2. **Edit env.local with your API keys:**

   ```bash
   nano env.local  # or use your preferred editor
   ```

3. **Required Environment Variables:**

   - `OPENAI_API_KEY`: Your OpenAI API key for AI services
   - `POLYGON_API_KEY`: Your Polygon API key for market data

4. **Verify your setup:**
   ```bash
   python setup_env.py
   ```

## Environment Variables

### Required Variables

| Variable          | Description                     | Example  |
| ----------------- | ------------------------------- | -------- |
| `OPENAI_API_KEY`  | OpenAI API key for AI services  | `sk-...` |
| `POLYGON_API_KEY` | Polygon API key for market data | `...`    |

### Optional Variables

| Variable | Description       | Default   |
| -------- | ----------------- | --------- |
| `DEBUG`  | Enable debug mode | `True`    |
| `HOST`   | Server host       | `0.0.0.0` |
| `PORT`   | Server port       | `8000`    |

## Getting API Keys

### OpenAI API Key

1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Sign up or log in
3. Navigate to API Keys section
4. Create a new API key
5. Copy the key and add it to your `env.local`

### Polygon API Key

1. Go to [Polygon.io](https://polygon.io/)
2. Sign up for an account
3. Navigate to API Keys section
4. Create a new API key
5. Copy the key and add it to your `env.local`

## Security Notes

- Never commit your `env.local` file to version control
- The `env.local` file is already in `.gitignore`
- Use the `env.template` file as a reference for required variables
- Keep your API keys secure and don't share them

## Troubleshooting

If you encounter issues:

1. **ModuleNotFoundError**: Make sure you've installed all dependencies:

   ```bash
   pip install -r requirements.txt
   ```

2. **Environment variables not loading**: Make sure your `env.local` file is in the correct location and has the right format

3. **API key errors**: Verify your API keys are correct and have the necessary permissions

4. **Run the setup script**: Use `python setup_env.py` to verify your configuration
