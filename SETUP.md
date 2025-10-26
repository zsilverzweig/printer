# Setup

## First Time Setup

```bash
# 1. Copy env files
cp env.template .env.local
cp apps/server/env.template apps/server/env.local

# 2. Fill in your API keys (see links in the files)

# 3. Setup git-crypt (one time)
brew install git-crypt
git-crypt init
git-crypt export-key ~/printer-gitcrypt.key

# 4. Commit encrypted env files
git add .env.local apps/server/env.local
git commit -m "Add encrypted env files"
```

## Second Machine Setup

```bash
git clone <repo>
cd printer
git-crypt unlock ~/printer-gitcrypt.key
```

## Run

```bash
# Start everything with Docker
nx docker:up printer

# Or without Docker
npm run dev
```

## Access

- Web: http://localhost:3000
- API: http://localhost:8000/docs
- DB: localhost:5432 (user: postgres, pass: postgres)

