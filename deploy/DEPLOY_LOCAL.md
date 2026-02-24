# OpenFinClaw 本地开发部署

## 环境信息

| 项目       | 值                                 |
| ---------- | ---------------------------------- |
| 配置文件   | `deploy/.env.local`                |
| 模型配置   | `deploy/config/finclaw.local.json` |
| Compose    | `deploy/docker-compose.local.yml`  |
| NODE_ENV   | development                        |
| PostgreSQL | 16-alpine (轻量, 50 连接)          |
| Redis      | 7-alpine (256MB + LRU)             |

## 前置条件

- Docker Desktop 已安装并运行
- Git 已安装

## 快速启动

### 1. 配置环境变量

```bash
# 从模板创建 (首次)
cp deploy/.env.example deploy/.env.local

# 编辑配置
vi deploy/.env.local
```

必须配置:

- `LITELLM_BASE_URL` — LiteLLM Proxy 地址 (如果使用)
- `LITELLM_API_KEY` — LiteLLM API Key
- 或直接配置 `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`

### 2. 启动服务

```bash
# 一键启动
./deploy/scripts/start_local.sh

# 或强制重新构建
./deploy/scripts/start_local.sh --build
```

### 3. 验证

```bash
# 查看服务状态
./deploy/scripts/start_local.sh --status

# 检查 Gateway
curl http://localhost:18789/health

# 访问 Control UI
# 浏览器打开: http://localhost:18789
```

## 服务架构

```
┌────────────────────────────────────────────────┐
│  finclaw-gateway-local (18789)                  │
│  WebSocket 网关 + Control UI + WebChat          │
│  Agent: FinClaw (金融功能默认启用)              │
├──────────────────────┬─────────────────────────┤
│                      │                          │
│  finclaw-redis-local │  finclaw-postgres-local  │
│  (6381)              │  (5434)                  │
│  256MB LRU           │  50 conn, 128MB buf      │
└──────────────────────┴─────────────────────────┘
```

## 常用操作

```bash
# 查看所有日志
./deploy/scripts/start_local.sh --logs

# 重启
./deploy/scripts/start_local.sh --restart

# 停止
./deploy/scripts/start_local.sh --stop

# 状态
./deploy/scripts/start_local.sh --status
```

## 模型配置

编辑 `deploy/config/finclaw.local.json` 的 `models.providers.litellm.models` 列表。

预置模型:

- **Kimi K2.5** (首选, 256K 上下文)
- **Claude Sonnet 4.6** (推理, 200K 上下文)
- **Minimax 2.5** (128K 上下文)
- **GLM-5** (128K 上下文)

切换默认模型:

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

## 故障排查

```bash
# Gateway 启动失败
docker logs finclaw-gateway-local --tail 50

# PostgreSQL 连接问题
docker logs finclaw-postgres-local --tail 50
docker exec finclaw-postgres-local psql -U postgres -c "SELECT 1;"

# Redis 检查
docker exec finclaw-redis-local redis-cli ping

# 查看容器内配置文件
docker exec finclaw-gateway-local cat /root/.openfinclaw/openfinclaw.json

# 数据卷空间
docker system df

# 完全重建 (清除状态)
./deploy/scripts/start_local.sh --stop
docker volume rm finclaw-local_finclaw-local-state
./deploy/scripts/start_local.sh --build
```
