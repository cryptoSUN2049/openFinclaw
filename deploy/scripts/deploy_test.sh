#!/bin/bash
# ==============================================================================
# OpenFinClaw Test 环境部署脚本
# ==============================================================================
# Test 环境: PostgreSQL + Redis + Gateway + LiteLLM (Kimi K2.5)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DEPLOY_DIR="$PROJECT_ROOT/deploy"

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 配置
ENV_FILE="deploy/.env.test"
COMPOSE_FILE="docker-compose.test.yml"

# ==============================================================================
# 帮助信息
# ==============================================================================
show_help() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "OpenFinClaw Test 环境部署 (PostgreSQL + Redis + Gateway + LiteLLM)"
    echo ""
    echo "Options:"
    echo "  --stop          停止所有服务"
    echo "  --restart       重启所有服务"
    echo "  --logs          查看所有日志"
    echo "  --logs-gw       查看 Gateway 日志"
    echo "  --logs-pg       查看 PostgreSQL 日志"
    echo "  --logs-redis    查看 Redis 日志"
    echo "  --build         强制重新构建"
    echo "  --status        查看服务状态 + 健康检查"
    echo "  --pg-conn       查看 PostgreSQL 连接数"
    echo "  --backup        备份 PostgreSQL 数据"
    echo "  --help          显示帮助"
}

# ==============================================================================
# 检查依赖
# ==============================================================================
check_deps() {
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}Error: docker is not installed${NC}"
        exit 1
    fi

    if ! docker info &> /dev/null; then
        echo -e "${RED}Error: Docker daemon is not running${NC}"
        exit 1
    fi
}

# ==============================================================================
# 创建网络
# ==============================================================================
create_network() {
    docker network create finclaw-network 2>/dev/null || true
}

# ==============================================================================
# 预处理配置文件: 替换环境变量占位符
# ==============================================================================
prepare_config() {
    CONFIG_TEMPLATE="$DEPLOY_DIR/config/finclaw.test.json"
    CONFIG_RUNTIME="$DEPLOY_DIR/config/.finclaw.test.runtime.json"

    if [ ! -f "$CONFIG_TEMPLATE" ]; then
        echo -e "${RED}Error: Config template not found: $CONFIG_TEMPLATE${NC}"
        exit 1
    fi

    # 从 .env.test 加载变量
    if [ -f "$PROJECT_ROOT/$ENV_FILE" ]; then
        set -a
        source "$PROJECT_ROOT/$ENV_FILE"
        set +a
    fi

    # 替换占位符 (所有 ${VAR} 引用)
    sed \
        -e "s|\${GATEWAY_AUTH_TOKEN}|${GATEWAY_AUTH_TOKEN:-finclaw-test}|g" \
        -e "s|\${LITELLM_BASE_URL}|${LITELLM_BASE_URL}|g" \
        -e "s|\${LITELLM_API_KEY}|${LITELLM_API_KEY}|g" \
        -e "s|\${TELEGRAM_BOT_TOKEN}|${TELEGRAM_BOT_TOKEN}|g" \
        -e "s|\${BINANCE_TESTNET_API_KEY}|${BINANCE_TESTNET_API_KEY:-${BINANCE_API_KEY}}|g" \
        -e "s|\${BINANCE_TESTNET_SECRET}|${BINANCE_TESTNET_SECRET:-${BINANCE_API_SECRET}}|g" \
        "$CONFIG_TEMPLATE" > "$CONFIG_RUNTIME"

    echo -e "${BLUE}Config prepared: $CONFIG_RUNTIME${NC}"
}

# ==============================================================================
# 启动服务
# ==============================================================================
start_services() {
    echo -e "${GREEN}Starting OpenFinClaw Test services...${NC}"

    cd "$PROJECT_ROOT"

    if [ ! -f "$PROJECT_ROOT/$ENV_FILE" ]; then
        echo -e "${RED}Error: $ENV_FILE not found${NC}"
        echo "  Expected at: $PROJECT_ROOT/$ENV_FILE"
        exit 1
    fi

    create_network
    prepare_config

    if [ "$BUILD" = true ]; then
        docker compose -f "$DEPLOY_DIR/$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --build
    else
        docker compose -f "$DEPLOY_DIR/$COMPOSE_FILE" --env-file "$ENV_FILE" up -d
    fi

    echo ""
    echo -e "${GREEN}Test services started!${NC}"
    echo ""
    echo "  Gateway (WS + UI):  http://localhost:8020"
    echo "  PostgreSQL:         localhost:5433"
    echo "  Redis:              localhost:6380"
    echo ""
    echo -e "${BLUE}首选模型: Kimi K2.5 via LiteLLM Proxy${NC}"
    echo ""
}

# ==============================================================================
# 停止服务
# ==============================================================================
stop_services() {
    echo -e "${YELLOW}Stopping OpenFinClaw Test services...${NC}"
    cd "$PROJECT_ROOT"
    docker compose -f "$DEPLOY_DIR/$COMPOSE_FILE" --env-file "$ENV_FILE" down
    echo -e "${GREEN}Services stopped.${NC}"
}

# ==============================================================================
# 查看日志
# ==============================================================================
show_logs() {
    cd "$PROJECT_ROOT"
    docker compose -f "$DEPLOY_DIR/$COMPOSE_FILE" logs -f
}

show_logs_gw() {
    docker logs finclaw-gateway-v2 --tail 100 -f
}

show_logs_pg() {
    docker logs finclaw-postgres-v2 --tail 100 -f
}

show_logs_redis() {
    docker logs finclaw-redis-v2 --tail 100 -f
}

# ==============================================================================
# 查看状态
# ==============================================================================
show_status() {
    echo -e "${GREEN}OpenFinClaw Test 服务状态:${NC}"
    echo ""
    docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep -E "finclaw|NAMES"
    echo ""

    # 健康检查
    echo -e "${BLUE}健康检查:${NC}"
    echo -n "  Gateway:    "
    curl -s http://localhost:8020/health && echo "" || echo "FAILED"
    echo -n "  PostgreSQL: "
    docker exec finclaw-postgres-v2 pg_isready -U postgres 2>/dev/null && echo "" || echo "FAILED"
    echo -n "  Redis:      "
    docker exec finclaw-redis-v2 redis-cli ping 2>/dev/null || echo "FAILED"
}

# ==============================================================================
# PostgreSQL 连接数
# ==============================================================================
pg_connections() {
    echo -e "${BLUE}PostgreSQL 连接统计:${NC}"
    docker exec finclaw-postgres-v2 psql -U postgres -d finclaw -c \
        "SELECT state, count(*) FROM pg_stat_activity GROUP BY state ORDER BY count DESC;" 2>/dev/null || \
        echo -e "${RED}无法连接到 PostgreSQL${NC}"
}

# ==============================================================================
# PostgreSQL 备份
# ==============================================================================
pg_backup() {
    BACKUP_FILE="finclaw_test_$(date +%Y%m%d_%H%M%S).sql.gz"
    echo -e "${BLUE}Backing up PostgreSQL to $BACKUP_FILE ...${NC}"
    docker exec finclaw-postgres-v2 pg_dump -U postgres finclaw | gzip > "$BACKUP_FILE"
    echo -e "${GREEN}Backup saved: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))${NC}"
}

# ==============================================================================
# 主逻辑
# ==============================================================================
main() {
    check_deps

    case "$1" in
        --stop)
            stop_services
            ;;
        --restart)
            stop_services
            BUILD=true
            start_services
            ;;
        --logs)
            show_logs
            ;;
        --logs-gw)
            show_logs_gw
            ;;
        --logs-pg)
            show_logs_pg
            ;;
        --logs-redis)
            show_logs_redis
            ;;
        --build)
            BUILD=true
            start_services
            ;;
        --status)
            show_status
            ;;
        --pg-conn)
            pg_connections
            ;;
        --backup)
            pg_backup
            ;;
        --help)
            show_help
            ;;
        *)
            start_services
            ;;
    esac
}

main "$@"
