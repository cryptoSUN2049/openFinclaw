# OpenFinClaw Prod 环境部署

## 环境信息

| 项目     | 值                              |
| -------- | ------------------------------- |
| 服务器   | TBD                             |
| 配置文件 | `.env` (项目根目录)             |
| Compose  | `deploy/docker-compose.prd.yml` |
| NODE_ENV | production                      |

## 与 Local/Test 的差异

| 特性       | Local/Test     | Prod              |
| ---------- | -------------- | ----------------- |
| NODE_ENV   | development    | **production**    |
| restart    | unless-stopped | **always**        |
| 构建方式   | `--build`      | `--no-cache`      |
| 操作确认   | 无             | **需要 yes 确认** |
| 回滚支持   | 无             | `--rollback`      |
| Redis 配置 | 256-512MB      | 256MB + LRU       |
| 健康检查   | 宽松           | 严格 (`/health`)  |
| 金融功能   | 启用           | **启用**          |

## 首次部署

### 1. 服务器准备

```bash
ssh root@<PROD_IP>

# 安装 Docker
curl -fsSL https://get.docker.com | sh
systemctl enable docker && systemctl start docker

# 克隆代码
cd /home
git clone <REPO_URL> finclaw
cd finclaw
```

### 2. 配置环境变量

```bash
# 生产环境使用项目根目录的 .env
cp deploy/.env.example .env
vi .env
```

**必须配置:**

```bash
# 强随机 token (必须!)
GATEWAY_AUTH_TOKEN=$(openssl rand -hex 32)

# LLM API Key (至少一个)
ANTHROPIC_API_KEY=sk-ant-...
# 或
OPENAI_API_KEY=sk-...

# 允许的 Origin (你的域名)
GATEWAY_ALLOWED_ORIGINS=https://your-domain.com

# 交易所 API (按需)
HYPERLIQUID_API_KEY=...
BINANCE_API_KEY=...
```

### 3. HTTPS 配置 (推荐)

生产环境强烈建议使用 HTTPS。推荐使用 Caddy 或宿主机 Nginx 反向代理:

```nginx
# /etc/nginx/sites-available/finclaw
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # Gateway WebSocket + HTTP
    location / {
        proxy_pass http://127.0.0.1:18789;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}
```

### 4. 启动服务

```bash
./deploy/scripts/deploy_prod.sh --build
```

### 5. 验证

```bash
./deploy/scripts/deploy_prod.sh --status
curl http://localhost:18789/health
```

## 日常更新

```bash
# 方式 1: 使用脚本 (推荐)
./deploy/scripts/deploy_prod.sh --restart

# 方式 2: 手动
cd /home/finclaw
git pull
docker compose -f deploy/docker-compose.prd.yml --env-file .env build --no-cache
docker compose -f deploy/docker-compose.prd.yml --env-file .env down
docker compose -f deploy/docker-compose.prd.yml --env-file .env up -d
```

## 回滚

```bash
# 回滚到上一个 commit
./deploy/scripts/deploy_prod.sh --rollback

# 手动回滚到指定版本
git checkout <commit-hash>
docker compose -f deploy/docker-compose.prd.yml --env-file .env build --no-cache
docker compose -f deploy/docker-compose.prd.yml --env-file .env down
docker compose -f deploy/docker-compose.prd.yml --env-file .env up -d
```

## 监控

```bash
# 服务状态 + 健康检查
./deploy/scripts/deploy_prod.sh --status

# 实时日志
./deploy/scripts/deploy_prod.sh --logs

# 单容器日志
docker logs finclaw-gateway --tail 100 -f

# Docker 资源使用
docker stats
```

## 安全清单

- [ ] `GATEWAY_AUTH_TOKEN` 使用强随机值 (`openssl rand -hex 32`)
- [ ] `.env` 文件权限设为 `600` (`chmod 600 .env`)
- [ ] 配置 HTTPS (Nginx/Caddy 反向代理)
- [ ] `GATEWAY_ALLOWED_ORIGINS` 只允许你的域名
- [ ] 交易所 API Key 权限最小化 (只读/仅交易)
- [ ] 定期更新: `git pull && deploy --restart`
- [ ] 监控磁盘空间: `docker system df`
- [ ] 定期清理: `docker system prune -f`

## 服务架构

```
             ┌─────────────────────┐
             │  Nginx/Caddy (443)  │  ← HTTPS 终端
             └──────────┬──────────┘
                        │
┌───────────────────────▼─────────────────────────┐
│  finclaw-gateway (18789)                         │
│  WebSocket 网关 + Control UI + WebChat           │
│  Agent: FinClaw | 金融功能启用                   │
│  restart: always | NODE_ENV: production          │
├─────────────────────────────────────────────────┤
│  finclaw-redis (6379)                            │
│  会话缓存 (256MB + LRU) | restart: always       │
└─────────────────────────────────────────────────┘
```

## 故障排查

```bash
# Gateway 启动失败
docker logs finclaw-gateway --tail 50

# OOM (内存不足)
docker stats --no-stream
# 如果内存不足，增大 VM 内存或减少 Redis maxmemory

# 端口冲突
ss -tlnp | grep 18789

# 完全重建
docker compose -f deploy/docker-compose.prd.yml --env-file .env down -v
docker compose -f deploy/docker-compose.prd.yml --env-file .env up -d --build
```
