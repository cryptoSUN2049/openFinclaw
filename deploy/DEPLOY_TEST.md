# OpenFinClaw Test 环境部署

## 环境信息

| 项目       | 值                                |
| ---------- | --------------------------------- |
| 服务器     | TBD                               |
| 配置文件   | `deploy/.env.test`                |
| 模型配置   | `deploy/config/finclaw.test.json` |
| Compose    | `deploy/docker-compose.test.yml`  |
| NODE_ENV   | development                       |
| 首选模型   | Kimi K2.5 via LiteLLM Proxy       |
| PostgreSQL | 16-alpine (高并发调优)            |
| Redis      | 7-alpine (512MB + LRU)            |

## 与 Local 的差异

| 特性       | Local        | Test                          |
| ---------- | ------------ | ----------------------------- |
| 模型调度   | 直连 LLM API | **LiteLLM Proxy 统一调度**    |
| 首选模型   | Kimi K2.5    | **Kimi K2.5**                 |
| PostgreSQL | 轻量 50 conn | **高并发 200 conn / 1GB buf** |
| Redis 配置 | 256MB        | **512MB + LRU**               |
| 并发支持   | 一般         | **30+ 用户**                  |
| 数据备份   | 无           | **pg_dump**                   |
| Telegram   | 未配置       | **已启用 (开放策略)**         |

## 服务架构

```
┌─────────────────────────────────────────────────────────────┐
│  finclaw-gateway-v2 (8020)                                   │
│  WebSocket 网关 + Control UI + WebChat                       │
│  Agent: FinClaw (金融功能默认启用)                           │
│  首选模型: litellm/moonshotai/kimi-k2.5                      │
├─────────────────┬────────────────────────────────────────────┤
│                 │                                             │
│                 ▼                                             │
│  LiteLLM Proxy (外部)                                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ Kimi K2.5│  │ Claude   │  │Minimax2.5│  │ GLM-5    │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
├─────────────────────────────────────────────────────────────┤
│  finclaw-redis-v2 (6380)                                     │
│  会话缓存 (512MB + LRU)                                     │
├─────────────────────────────────────────────────────────────┤
│  finclaw-postgres-v2 (5433)                                  │
│  持久化存储 (max_conn=200, shared_buffers=1GB)              │
└─────────────────────────────────────────────────────────────┘
```

## 首次部署

### 1. 服务器准备

```bash
ssh root@<TEST_IP>

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
vi deploy/.env.test
```

必须配置:

- `LITELLM_BASE_URL` — LiteLLM Proxy 地址
- `LITELLM_API_KEY` — LiteLLM API Key
- `GATEWAY_AUTH_TOKEN` — 网关认证 Token
- `POSTGRES_PASSWORD` — 修改默认密码!
- `TELEGRAM_BOT_TOKEN` — Telegram Bot Token (如需要)

### 3. 检查模型配置

```bash
# 查看/编辑 LiteLLM + 模型配置
cat deploy/config/finclaw.test.json
```

配置文件中的占位符 (`${LITELLM_BASE_URL}` 等) 会在部署脚本启动时自动替换。

### 4. 启动服务

```bash
./deploy/scripts/deploy_test.sh --build
```

### 5. 验证

```bash
# 服务状态 + 健康检查
./deploy/scripts/deploy_test.sh --status

# 检查各服务
curl http://localhost:8020/health
docker exec finclaw-postgres-v2 pg_isready -U postgres
docker exec finclaw-redis-v2 redis-cli ping

# 检查 Control UI
# 浏览器打开: http://<TEST_IP>:8020
```

## 日常更新

```bash
cd /home/finclaw && git pull
./deploy/scripts/deploy_test.sh --restart
```

## LiteLLM Proxy 集成

Test 环境通过 LiteLLM Proxy 统一调度多个 LLM Provider:

```
┌──────────────┐     ┌─────────────────┐     ┌──────────────┐
│ FinClaw GW   │────→│  LiteLLM Proxy  │────→│ Moonshot     │ ← Kimi K2.5 (首选)
│              │     │                 │     │ Anthropic    │ ← Claude Sonnet 4.6
│              │     │                 │     │ Minimax      │ ← Minimax 2.5
│              │     │                 │     │ Zhipu        │ ← GLM-5
└──────────────┘     └─────────────────┘     └──────────────┘
```

### 切换模型

编辑 `deploy/config/finclaw.test.json`:

```json
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "litellm/anthropic/claude-sonnet-4-6-20261001"
      }
    }
  }
}
```

然后重启: `./deploy/scripts/deploy_test.sh --restart`

## PostgreSQL 管理

### 查看连接数

```bash
./deploy/scripts/deploy_test.sh --pg-conn
```

### 数据库备份

```bash
# 自动备份 (gzip 压缩)
./deploy/scripts/deploy_test.sh --backup

# 手动备份
docker exec finclaw-postgres-v2 pg_dump -U postgres finclaw > backup.sql
```

### 恢复备份

```bash
gunzip finclaw_test_20260224.sql.gz
docker exec -i finclaw-postgres-v2 psql -U postgres finclaw < finclaw_test_20260224.sql
```

### PostgreSQL 调优参数 (已在 docker-compose.test.yml 中配置)

```
max_connections=200          # 最大连接数
shared_buffers=1GB           # 共享缓冲区 (~25% 系统内存)
effective_cache_size=3GB     # 有效缓存 (~75% 系统内存)
work_mem=64MB                # 排序/哈希工作内存
maintenance_work_mem=256MB   # VACUUM/CREATE INDEX 内存
max_parallel_workers=4       # 最大并行工作进程
wal_buffers=16MB             # WAL 缓冲区
checkpoint_completion_target=0.9
```

## 常用操作

```bash
# 查看所有日志
./deploy/scripts/deploy_test.sh --logs

# 查看单个服务日志
./deploy/scripts/deploy_test.sh --logs-gw
./deploy/scripts/deploy_test.sh --logs-pg
./deploy/scripts/deploy_test.sh --logs-redis

# 重启
./deploy/scripts/deploy_test.sh --restart

# 停止
./deploy/scripts/deploy_test.sh --stop

# 状态
./deploy/scripts/deploy_test.sh --status
```

## 故障排查

```bash
# Gateway 启动失败
docker logs finclaw-gateway-v2 --tail 50

# PostgreSQL 连接问题
docker logs finclaw-postgres-v2 --tail 50
docker exec finclaw-postgres-v2 psql -U postgres -c "SELECT 1;"

# Redis 检查
docker exec finclaw-redis-v2 redis-cli ping

# 查看配置文件 (容器内)
docker exec finclaw-gateway-v2 cat /root/.openfinclaw/openfinclaw.json

# 数据卷空间
docker system df
docker volume ls

# 完全重建
./deploy/scripts/deploy_test.sh --stop
docker volume rm finclaw-test_finclaw-state  # 仅清除 Gateway 状态
./deploy/scripts/deploy_test.sh --build
```
