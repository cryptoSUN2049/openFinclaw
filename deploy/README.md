# OpenFinClaw Deploy 目录

## 目录结构

```
deploy/
├── .env.example                          # 环境变量模板
├── README.md                             # 本文件 (总览)
├── DEPLOY_LOCAL.md                       # 本地开发部署文档
├── DEPLOY_TEST.md                        # Test 环境部署文档
├── DEPLOY_PROD.md                        # Prod 环境部署文档
│
├── Dockerfile.gateway                    # Gateway 多阶段构建 (slim)
│
├── docker-compose.local.yml              # 本地开发环境
├── docker-compose.test.yml               # 测试环境
├── docker-compose.prd.yml                # 生产环境
│
├── config/
│   ├── finclaw.local.json                # 本地 Gateway 配置
│   └── finclaw.test.json                 # 测试 Gateway 配置
│
└── scripts/
    ├── start_local.sh                    # 本地启动
    ├── deploy_test.sh                    # 部署到 Test
    ├── deploy_prod.sh                    # 部署到 Prod
    └── deploy_server.sh                  # 服务器一键部署
```

## 快速入口

| 环境  | 配置文件     | Docker Compose             | 服务器    |
| ----- | ------------ | -------------------------- | --------- |
| Local | `.env.local` | `docker-compose.local.yml` | localhost |
| Test  | `.env.test`  | `docker-compose.test.yml`  | TBD       |
| Prod  | `.env`       | `docker-compose.prd.yml`   | TBD       |

## 服务架构

```
┌─────────────────────────────────────────────────────────────────┐
│  OpenFinClaw Stack                                               │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              finclaw-gateway (18789)                        │  │
│  │     WebSocket 网关 + Control UI + WebChat                  │  │
│  │     金融功能默认启用 (交易/行情/组合/监控)                │  │
│  └──────────────────────┬────────────────────────────────────┘  │
│                         │                                        │
│  ┌──────────────────────▼────────────────────────────────────┐  │
│  │              finclaw-redis (6379)                           │  │
│  │              会话缓存 + 状态存储                            │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              finclaw-postgres (5432)  [Local/Test]          │  │
│  │              持久化存储 (可选)                              │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## 本地开发 (推荐)

```bash
# 一键启动 (Docker)
./deploy/scripts/start_local.sh

# 强制重新构建
./deploy/scripts/start_local.sh --build

# 查看日志
./deploy/scripts/start_local.sh --logs

# 停止
./deploy/scripts/start_local.sh --stop
```

## 日常代码更新

```bash
# Test 服务器
ssh root@<TEST_IP> "cd /home/finclaw && git pull && \
  ./deploy/scripts/deploy_test.sh --restart"

# Prod 服务器
ssh root@<PROD_IP> "cd /home/finclaw && git pull && \
  ./deploy/scripts/deploy_prod.sh --restart"
```

## 环境差异

| 项目       | Local       | Test          | Prod       |
| ---------- | ----------- | ------------- | ---------- |
| 配置文件   | .env.local  | .env.test     | .env       |
| Compose    | local.yml   | test.yml      | prd.yml    |
| NODE_ENV   | development | development   | production |
| PostgreSQL | 本地 (轻量) | 本地 (高并发) | 外部       |
| Redis      | 256MB       | 512MB         | 256MB      |
| restart    | unless-stop | unless-stop   | always     |
| 金融功能   | 启用        | 启用          | 启用       |

## 环境变量

详见 `.env.example`

| 变量                      | 说明                      |
| ------------------------- | ------------------------- |
| `GATEWAY_PORT`            | Gateway 端口 (默认 18789) |
| `GATEWAY_AUTH_TOKEN`      | Gateway WS 认证 token     |
| `GATEWAY_ALLOWED_ORIGINS` | 允许的 CORS Origin        |
| `GATEWAY_DEFAULT_MODEL`   | 默认 AI 模型              |
| `ANTHROPIC_API_KEY`       | Anthropic API Key         |
| `OPENAI_API_KEY`          | OpenAI API Key            |
| `FINANCE_ENABLED`         | 金融功能开关 (默认 true)  |
| `HYPERLIQUID_API_KEY`     | Hyperliquid 交易所 API    |
| `BINANCE_API_KEY`         | Binance 交易所 API        |
| `OKX_API_KEY`             | OKX 交易所 API            |

## 注意事项

- **修改 .env 后需要 `docker compose down && up` 重建容器**
- `docker restart` 不会加载新环境变量
- Gateway 需要正确配置 LLM API Key (Anthropic/OpenAI 或 LiteLLM Proxy)
- 生产环境建议配置 HTTPS (通过反向代理如 Nginx/Caddy)
- Gateway 内置 Control UI 和 WebChat，无需独立前端容器
- 金融功能默认启用，交易所 API 按需配置
