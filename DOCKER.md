# Docker Development Setup

This guide covers running the Printer application stack (Next.js, FastAPI, PostgreSQL) using Docker containers with hot-reload for development.

## Prerequisites

1. **Docker Desktop**: Install from [docker.com](https://www.docker.com/products/docker-desktop)
2. **git-crypt**: For managing encrypted environment files
   - macOS: `brew install git-crypt`
   - Ubuntu/Debian: `apt-get install git-crypt`
   - Windows: Download from [git-crypt releases](https://github.com/AGWA/git-crypt/releases)

## Initial Setup

### 1. Configure git-crypt (First Time Only)

git-crypt encrypts your environment files so you can safely commit them to the repository and sync them across your machines.

**On your first machine:**

```bash
# Initialize git-crypt in the repo
git-crypt init

# Export the key for use on other machines
git-crypt export-key ~/printer-gitcrypt.key

# Move the key to a safe location (e.g., cloud storage, password manager)
# You'll need this file to set up your second machine
```

**On your second machine:**

```bash
# Clone the repo
git clone <repo-url>
cd printer

# Unlock the encrypted files using the key from your first machine
git-crypt unlock ~/printer-gitcrypt.key

# The .env files will now be automatically decrypted
```

### 2. Create Environment Files

```bash
# Copy template files
cp env.template .env.local
cp apps/server/env.template apps/server/env.local

# Edit and fill in your API keys (links in the files)
```

### 3. Commit Encrypted Files (Optional but Recommended)

Once you've configured your environment files, commit them:

```bash
# Add and commit - git-crypt will automatically encrypt them
git add .env.local apps/server/env.local
git commit -m "Add encrypted environment files"
git push
```

Now when you pull on your second machine, the files will automatically decrypt!

## Running the Application

### Start All Services

Using NX (recommended):

```bash
nx docker:up printer
```

Or using docker-compose directly:

```bash
docker-compose up --build
```

This starts:
- **PostgreSQL** on `localhost:5432`
- **FastAPI** on `localhost:8000`
- **Next.js** on `localhost:3000`

### Start in Background (Detached Mode)

```bash
nx docker:up:detached printer
```

### View Logs

```bash
# All services
nx docker:logs printer

# Specific service
nx docker:logs:web printer
nx docker:logs:server printer
nx docker:logs:db printer
```

### Stop Services

```bash
nx docker:down printer
```

### Stop and Remove Database Data

**WARNING**: This deletes all database data!

```bash
nx docker:down:volumes printer
```

### Restart Services

```bash
nx docker:restart printer
```

### Rebuild Containers

If you change Dockerfiles or dependencies:

```bash
nx docker:rebuild printer
```

### Check Service Status

```bash
nx docker:ps printer
```

## Service URLs

- **Web Application**: http://localhost:3000
- **API Documentation**: http://localhost:8000/docs
- **API Health Check**: http://localhost:8000/health
- **PostgreSQL**: localhost:5432
  - Database: `printer_events`
  - User: `postgres`
  - Password: `postgres`

## Hot Reload

All services support hot-reload during development:

- **Next.js**: Changes to files in `apps/web/` automatically reload
- **FastAPI**: Changes to files in `apps/server/app/` automatically reload
- **Database**: Data persists in Docker volume `printer-postgres-data`

## Connecting to Services

### From Your Local Machine

Services are exposed on `localhost`:
- Web: `http://localhost:3000`
- Server: `http://localhost:8000`
- Database: `localhost:5432`

### Between Docker Containers

Services use Docker service names on the internal network:
- Web: `http://web:3000`
- Server: `http://server:8000`
- Database: `postgresql://postgres:postgres@db:5432/printer_events`

## Troubleshooting

### Port Already in Use

If ports 3000, 8000, or 5432 are already in use:

```bash
# Check what's using the port
lsof -i :3000
lsof -i :8000
lsof -i :5432

# Stop the conflicting service or change ports in docker-compose.yml
```

### Database Connection Issues

```bash
# Check if database is ready
docker-compose logs db

# Wait for this message:
# "database system is ready to accept connections"
```

### Container Build Fails

```bash
# Clean up and rebuild
docker-compose down -v
docker system prune -a
docker-compose up --build
```

### Changes Not Reflecting

```bash
# For Next.js: Clear .next directory
rm -rf apps/web/.next

# For FastAPI: Check logs for syntax errors
nx docker:logs:server printer

# Rebuild containers
nx docker:rebuild printer
```

### Database Data Persistence

Data is stored in a named Docker volume `printer-postgres-data`. To reset:

```bash
# WARNING: This deletes all data!
nx docker:down:volumes printer
nx docker:up printer
```

### Viewing Database Contents

Connect using any PostgreSQL client:

```bash
# Using psql
docker exec -it printer-db psql -U postgres -d printer_events

# Or use a GUI like pgAdmin, DBeaver, or TablePlus
# Host: localhost
# Port: 5432
# Database: printer_events
# User: postgres
# Password: postgres
```

## Development Workflow

1. **Start Docker services**: `nx docker:up printer`
2. **Make code changes**: Files automatically reload
3. **View logs**: `nx docker:logs printer` or check individual services
4. **Stop when done**: `nx docker:down printer`

## Switching Between Docker and Local Development

### Docker → Local

```bash
# Stop Docker services
nx docker:down printer

# Update server env.local to use localhost
# DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/printer_events

# Start local PostgreSQL (if not running)
# Then run services locally
npm run dev
```

### Local → Docker

```bash
# Update server env.local to use Docker service name
# DATABASE_URL=postgresql+asyncpg://postgres:postgres@db:5432/printer_events

# Start Docker services
nx docker:up printer
```

## Production Considerations

This setup is optimized for **development only**. For production:

- Create separate `Dockerfile.prod` files with multi-stage builds
- Use production-grade environment variables
- Set up proper secrets management
- Configure reverse proxy (nginx)
- Enable SSL/TLS
- Set up monitoring and logging
- Use docker-compose.prod.yml with production configurations

## Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [git-crypt Documentation](https://github.com/AGWA/git-crypt)
- [Next.js Docker Documentation](https://nextjs.org/docs/deployment#docker-image)
- [FastAPI Docker Documentation](https://fastapi.tiangolo.com/deployment/docker/)

