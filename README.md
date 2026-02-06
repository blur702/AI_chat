# AI Workstation

A containerized AI development workstation with LLM integration, image generation, and isolated preview environments.

## Architecture

The system follows a microkernel pattern with multiple services:

| Service | Description | Internal Port | Host Port |
|---------|-------------|---------------|-----------|
| PostgreSQL | Database with pgvector extension | 5432 | 5433 |
| Redis | Cache and task queue (AOF persistence) | 6379 | 6380 |
| Backend | FastAPI application server | 8000 | 8001 |
| Worker | ARQ background task processor | - | - |
| Frontend | Next.js web application | 3000 | 3001 |
| Nginx | Reverse proxy | 80/443 | 9080/8443 |

**External Domain**: `ssdd.kevinalthaus.com`

## Prerequisites

- **Docker**: Version 20.10 or higher
- **Docker Compose**: Version 2.0 or higher (included with Docker Desktop)
- **System Requirements**: Minimum 8GB RAM, 20GB disk space
- **External Services** (must be running on host):
  - [Ollama](https://ollama.ai/) on port 11434
  - [ComfyUI](https://github.com/comfyanonymous/ComfyUI) on port 8188

## Quick Start

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd AICHAT
   ```

2. **Configure environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your preferred editor and update values
   ```

3. **Generate SSL certificates for HTTPS**
   ```bash
   # Linux/macOS
   cd nginx/ssl && chmod +x generate-certs.sh && ./generate-certs.sh && cd ../..

   # Windows (Git Bash) - if script fails due to path conversion:
   cd nginx/ssl && MSYS_NO_PATHCONV=1 openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
     -keyout nginx-selfsigned.key -out nginx-selfsigned.crt \
     -subj "/C=US/ST=Local/L=Local/O=Development/OU=AI Workstation/CN=localhost" \
     -addext "subjectAltName=DNS:localhost,DNS:*.localhost,IP:127.0.0.1,IP:::1"
   cd ../..

   # Windows (WSL)
   cd nginx/ssl && bash generate-certs.sh && cd ../..
   ```
   This creates self-signed certificates for local development. See [nginx/README.md](nginx/README.md) for details.

4. **Start all services**
   ```bash
   docker-compose up -d
   ```

5. **Access the application**
   - Frontend: http://localhost:3001
   - Backend API: http://localhost:8001
   - Nginx Proxy (HTTP): http://localhost:9080
   - Nginx Proxy (HTTPS): https://localhost:8443
   - External (HTTPS): https://ssdd.kevinalthaus.com

   Note: Your browser will show a security warning for the self-signed certificate. This is expected in development.

## Network Architecture

The system uses two custom Docker networks:

### workstation-network (Default)
All core services communicate through this network:
- PostgreSQL, Redis, Backend, Worker, Frontend, Nginx
- Services use internal hostnames (e.g., `postgres`, `redis`) for communication

### workstation-preview-network (Isolated)
Used for sandboxed preview containers:
- Backend manages preview containers via the Docker socket
- Preview containers are isolated from core services
- Backend has access to both networks to manage and communicate with previews

### External Services
Ollama and ComfyUI run on the host machine and are accessed via `host.docker.internal`:
- Ollama: `http://host.docker.internal:11434`
- ComfyUI: `http://host.docker.internal:8188`

## Development Workflow

### View logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f worker
```

### Restart services
```bash
# Single service
docker-compose restart backend

# All services
docker-compose restart
```

### Rebuild after code changes
```bash
# Rebuild and restart specific service
docker-compose up -d --build backend

# Rebuild all services
docker-compose up -d --build
```

### Stop all services
```bash
docker-compose down
```

### Reset data (WARNING: destroys all data)
```bash
docker-compose down -v
```

## Infrastructure Verification

After starting the services, verify the infrastructure is working correctly:

### Quick Verification Checklist

| Component | Command | Expected Result |
|-----------|---------|-----------------|
| All Services | `docker-compose ps` | All "Up" and "healthy" |
| PostgreSQL | `docker exec workstation-postgres pg_isready -U workstation_user` | "accepting connections" |
| pgvector | `docker exec workstation-postgres psql -U workstation_user -d workstation -c "SELECT * FROM pg_extension WHERE extname = 'vector';"` | 1 row returned |
| Redis | `docker exec workstation-redis redis-cli -a $REDIS_PASSWORD ping` | "PONG" |
| Backend API | `curl http://localhost:8001/health` | `{"status":"healthy"}` |
| Frontend | `curl http://localhost:3001` | HTML response |
| Nginx HTTP | `curl http://localhost:9080/health` | "healthy" |
| Nginx HTTPS | `curl -k https://localhost:8443/health` | "healthy" |

### Verification Results (2026-02-02)

- Docker Version: 28.5.2
- Docker Compose Version: v2.40.3
- PostgreSQL: pgvector v0.8.1 enabled
- Redis: AOF persistence enabled (appendfsync=everysec)
- Networks: `workstation-network` and `workstation-preview-network` created
- Volumes: `postgres_data` and `redis_data` persistent
- SSL Certificate: Valid until Feb 2027
- Data Persistence: Verified for PostgreSQL and Redis

### Resource Usage (Typical)

| Service | Memory |
|---------|--------|
| postgres | ~20 MB |
| redis | ~4 MB |
| backend | ~57 MB |
| worker | ~24 MB |
| frontend | ~266 MB |
| nginx | ~19 MB |

## Troubleshooting

### Port Conflicts

If you have services already running on the default ports, update the port mappings in your `.env` file:

```bash
POSTGRES_PORT=5434    # Change from 5433
REDIS_PORT=6381       # Change from 6380
BACKEND_PORT=8002     # Change from 8001
FRONTEND_PORT=3002    # Change from 3001
NGINX_HTTP_PORT=9081  # Change from 9080
NGINX_HTTPS_PORT=9443 # Change from 8443
```

**Common conflicts**:
- Port 3000: Often used by other Node.js/React development servers
- Port 8080: Common for web servers, proxies, or Docker Desktop
- Port 8081: Sometimes used by Docker Desktop services

Check for port conflicts with:
```bash
# Windows
netstat -ano | findstr :3000

# Linux/macOS
lsof -i :3000
```

### Docker Socket Permission Issues

On Linux, the backend needs access to the Docker socket. If you encounter permission errors:

```bash
# Add your user to the docker group
sudo usermod -aG docker $USER

# Or adjust socket permissions (less secure)
sudo chmod 666 /var/run/docker.sock
```

### External Services Not Accessible

If the backend cannot reach Ollama or ComfyUI:

1. Verify services are running on the host:
   ```bash
   curl http://localhost:11434/api/tags  # Ollama
   curl http://localhost:8188/system_stats  # ComfyUI
   ```

2. On Linux, `host.docker.internal` may not work by default. Add to your `docker-compose.yml`:
   ```yaml
   backend:
     extra_hosts:
       - "host.docker.internal:host-gateway"
   ```

### Volume Permission Issues

If PostgreSQL or Redis fail to start due to permission issues:

```bash
# Remove existing volumes and recreate
docker-compose down -v
docker-compose up -d
```

### Container Health Checks Failing

Check the health status of services:
```bash
docker-compose ps
docker inspect workstation-postgres | grep -A 10 "Health"
```

## Project Structure

```
AICHAT/
├── docker-compose.yml      # Main Docker Compose configuration
├── .env.example            # Environment variables template
├── .env                    # Local environment (not in git)
├── .gitignore              # Git ignore rules
├── README.md               # This file
├── backend/                # FastAPI backend service
│   └── Dockerfile
├── frontend/               # Next.js frontend service
│   └── Dockerfile
└── nginx/                  # Nginx reverse proxy
    └── nginx.conf
```

## Next Steps

After completing this infrastructure setup, proceed with:

1. **PostgreSQL Configuration**: Set up database schema, migrations, and pgvector extension
2. **Redis Configuration**: Configure AOF persistence and caching strategies
3. **Backend Development**: Implement FastAPI endpoints and Docker management
4. **Worker Setup**: Configure ARQ for background task processing
5. **Frontend Development**: Build Next.js application
6. **Nginx Configuration**: Set up reverse proxy and SSL termination

## License

[Add your license here]
