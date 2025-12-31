# Docker Setup Guide for Discord Minecraft Bot

This guide explains how to run the Discord Minecraft Bot using Docker and Docker Compose.

## Prerequisites

- Docker Engine 20.10+
- Docker Compose v2.0+
- Discord Bot Token and Client ID
- PostgreSQL database (can be provided via Docker Compose)

## Quick Start

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd ipBotDiscord
   ```

2. **Create environment file:**
   ```bash
   cp .env.example .env
   ```

3. **Configure environment variables:**
   Edit `.env` file with your Discord bot credentials and other settings:
   ```bash
   # Required
   DISCORD_TOKEN=your_discord_bot_token
   DISCORD_CLIENT_ID=your_discord_client_id
   POSTGRES_PASSWORD=your_secure_password
   
   # Optional (defaults provided)
   DATABASE_URL=postgresql://ipbotuser:your_secure_password@postgres:5432/ipbotdiscord
   UPLOAD_URL=http://localhost:3000
   ```

4. **Start the services:**
   ```bash
   docker-compose up -d
   ```

5. **Register Discord commands (first time only):**
   ```bash
   docker-compose exec ipbot ./docker-entrypoint.sh register
   ```

6. **Check logs:**
   ```bash
   docker-compose logs -f ipbot
   ```

## Configuration

### Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DISCORD_TOKEN` | Discord bot token | `MTEx...xyz` |
| `DISCORD_CLIENT_ID` | Discord application client ID | `1234567890` |
| `POSTGRES_PASSWORD` | Database password | `securepassword123` |

### Optional Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Auto-generated |
| `UPLOAD_URL` | Base URL for file uploads | `http://localhost:3000` |
| `SERVER_DIR` | Minecraft server directory | `/app/servers/default` |
| `MINECRAFT_VERSION` | Minecraft version | `1.21.4` |
| `LOADER_TYPE` | Server loader type | `paper` |
| `MOD_TYPE` | Mod type | `plugin` |
| `CF_KEY` | Cloudflare API key | (none) |
| `UPDATE_URL` | Cloudflare DNS update URL | (none) |
| `CORS_ORIGIN` | CORS allowed origins | `*` |
| `APPROVAL_TIMEOUT` | Command approval timeout (ms) | `300000` |

### Port Configuration

| Service | Internal Port | Default External Port | Environment Variable |
|---------|---------------|----------------------|---------------------|
| Bot API | 3000 | 3000 | `BOT_PORT` |
| Minecraft API | 6001 | 6001 | `API_PORT` |
| PostgreSQL | 5432 | 5432 | `POSTGRES_PORT` |
| Web UI | 3000 | 3001 | `WEBUI_PORT` |

## Docker Compose Services

### Main Services

- **postgres**: PostgreSQL database with persistent storage
- **ipbot**: Main Discord bot application

### Optional Services

- **webui**: Standalone web interface (use profile `webui`)

To run with Web UI:
```bash
docker-compose --profile webui up -d
```

## Volume Management

### Persistent Volumes

- `postgres_data`: Database files
- `minecraft_data`: Minecraft server files
- `bot_data`: Bot application data

### Host Mounts

- `./logs`: Application logs (optional)

## Common Operations

### First-Time Setup

1. **Start services:**
   ```bash
   docker-compose up -d
   ```

2. **Wait for database initialization:**
   ```bash
   docker-compose logs postgres
   ```

3. **Register Discord commands:**
   ```bash
   docker-compose exec ipbot ./docker-entrypoint.sh register
   ```

4. **Create admin user (optional):**
   ```bash
   docker-compose exec ipbot bun tools/editPerm.ts
   ```

### Database Operations

**Run migrations:**
```bash
docker-compose exec ipbot ./docker-entrypoint.sh migrate
```

**Access database directly:**
```bash
docker-compose exec postgres psql -U ipbotuser -d ipbotdiscord
```

**Backup database:**
```bash
docker-compose exec postgres pg_dump -U ipbotuser ipbotdiscord > backup.sql
```

**Restore database:**
```bash
docker-compose exec -T postgres psql -U ipbotuser -d ipbotdiscord < backup.sql
```

### Application Management

**View logs:**
```bash
docker-compose logs -f ipbot
docker-compose logs -f postgres
```

**Restart services:**
```bash
docker-compose restart ipbot
docker-compose restart postgres
```

**Update application:**
```bash
git pull
docker-compose build ipbot
docker-compose up -d ipbot
```

**Access application shell:**
```bash
docker-compose exec ipbot ./docker-entrypoint.sh shell
```

## Development

### Development Mode

For development with hot reload:

```bash
# Set in .env
NODE_ENV=development

# Start with development override
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

### Building Custom Images

**Build specific service:**
```bash
docker-compose build ipbot
```

**Build with no cache:**
```bash
docker-compose build --no-cache ipbot
```

**Build for different architecture:**
```bash
docker buildx build --platform linux/amd64,linux/arm64 -t ipbot:latest .
```

## Troubleshooting

### Common Issues

1. **Database connection failed:**
   ```bash
   # Check if PostgreSQL is running
   docker-compose ps postgres
   
   # Check database logs
   docker-compose logs postgres
   
   # Test connection
   docker-compose exec ipbot pg_isready -h postgres -p 5432 -U ipbotuser
   ```

2. **Discord bot not responding:**
   ```bash
   # Check bot logs
   docker-compose logs ipbot
   
   # Verify environment variables
   docker-compose exec ipbot env | grep DISCORD
   
   # Check bot permissions in Discord
   ```

3. **File permission issues:**
   ```bash
   # Fix ownership
   sudo chown -R 1001:1001 ./data ./servers
   
   # Or run container as root (not recommended)
   docker-compose exec --user root ipbot bash
   ```

### Health Checks

**Check service health:**
```bash
docker-compose ps
```

**Manual health check:**
```bash
# Database
docker-compose exec postgres pg_isready -U ipbotuser -d ipbotdiscord

# Bot
docker-compose exec ipbot bun --version
```

### Debugging

**Enable debug mode:**
```bash
# Add to .env
DEBUG=true
LOG_LEVEL=debug
```

**Access container for debugging:**
```bash
docker-compose exec ipbot bash
```

**View container resource usage:**
```bash
docker stats
```

## Security Considerations

1. **Environment Variables:**
   - Never commit `.env` files to version control
   - Use strong passwords for database
   - Rotate Discord bot tokens regularly

2. **Network Security:**
   - Use custom networks (already configured)
   - Limit exposed ports to necessary ones only
   - Consider using a reverse proxy for web interfaces

3. **File Permissions:**
   - Containers run as non-root user (UID 1001)
   - Sensitive files should have restricted permissions

4. **Updates:**
   - Regularly update base images
   - Monitor for security vulnerabilities in dependencies

## Production Deployment

### Recommended Production Setup

1. **Use external database:**
   ```yaml
   # docker-compose.prod.yml
   services:
     ipbot:
       environment:
         DATABASE_URL: postgresql://user:pass@external-db:5432/db
   ```

2. **Enable resource limits:**
   ```yaml
   services:
     ipbot:
       deploy:
         resources:
           limits:
             memory: 512M
             cpus: '0.5'
   ```

3. **Use secrets management:**
   ```yaml
   services:
     ipbot:
       secrets:
         - discord_token
   secrets:
     discord_token:
       external: true
   ```

4. **Configure logging:**
   ```yaml
   services:
     ipbot:
       logging:
         driver: "json-file"
         options:
           max-size: "10m"
           max-file: "3"
   ```

### Monitoring

Consider adding monitoring services:

```yaml
# monitoring/docker-compose.monitoring.yml
services:
  prometheus:
    image: prom/prometheus
    # ... configuration

  grafana:
    image: grafana/grafana
    # ... configuration
```

## Support

For issues related to:
- **Docker setup**: Check this documentation and Docker logs
- **Application functionality**: Refer to main README.md
- **Database issues**: Check PostgreSQL documentation
- **Discord integration**: Verify bot permissions and Discord developer settings