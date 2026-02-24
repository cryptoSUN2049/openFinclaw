#!/bin/bash
# ==============================================================================
# OpenFinClaw Prod 环境部署脚本
# ==============================================================================

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
ENV_FILE=".env"
COMPOSE_FILE="docker-compose.prd.yml"

# ==============================================================================
# 帮助信息
# ==============================================================================
show_help() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "OpenFinClaw Prod 环境部署"
    echo ""
    echo "Options:"
    echo "  --stop          停止所有服务"
    echo "  --restart       重启所有服务 (安全方式)"
    echo "  --logs          查看日志"
    echo "  --build         强制重新构建 (无缓存)"
    echo "  --status        查看服务状态"
    echo "  --rollback      回滚到上一版本"
    echo "  --help          显示帮助"
    echo ""
    echo -e "${YELLOW}WARNING: 生产环境操作，请谨慎!${NC}"
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
# 确认操作
# ==============================================================================
confirm_action() {
    echo -e "${YELLOW}WARNING: 您正在操作生产环境!${NC}"
    read -p "确认继续? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        echo "操作已取消"
        exit 0
    fi
}

# ==============================================================================
# 启动服务
# ==============================================================================
start_services() {
    echo -e "${GREEN}Starting OpenFinClaw Prod services...${NC}"

    cd "$PROJECT_ROOT"

    if [ ! -f "$ENV_FILE" ]; then
        echo -e "${RED}Error: $ENV_FILE not found${NC}"
        echo "Please create .env file with production settings"
        exit 1
    fi

    create_network

    if [ "$BUILD" = true ]; then
        echo -e "${BLUE}Building with no-cache...${NC}"
        docker compose -f "$DEPLOY_DIR/$COMPOSE_FILE" --env-file "$ENV_FILE" build --no-cache
        docker compose -f "$DEPLOY_DIR/$COMPOSE_FILE" --env-file "$ENV_FILE" down
        docker compose -f "$DEPLOY_DIR/$COMPOSE_FILE" --env-file "$ENV_FILE" up -d
    else
        docker compose -f "$DEPLOY_DIR/$COMPOSE_FILE" --env-file "$ENV_FILE" up -d
    fi

    echo ""
    echo -e "${GREEN}Prod services started!${NC}"
    echo ""
    echo "  Gateway (WS + UI):  http://localhost:18789"
    echo "  Redis:              localhost:6379"
    echo ""
}

# ==============================================================================
# 停止服务
# ==============================================================================
stop_services() {
    confirm_action
    echo -e "${YELLOW}Stopping OpenFinClaw Prod services...${NC}"
    cd "$PROJECT_ROOT"
    docker compose -f "$DEPLOY_DIR/$COMPOSE_FILE" down
    echo -e "${GREEN}Services stopped.${NC}"
}

# ==============================================================================
# 安全重启
# ==============================================================================
safe_restart() {
    confirm_action
    echo -e "${BLUE}Safe restarting OpenFinClaw Prod services...${NC}"
    cd "$PROJECT_ROOT"

    # 拉取最新代码
    git pull

    # 构建新镜像
    docker compose -f "$DEPLOY_DIR/$COMPOSE_FILE" --env-file "$ENV_FILE" build --no-cache

    # 停止并启动
    docker compose -f "$DEPLOY_DIR/$COMPOSE_FILE" --env-file "$ENV_FILE" down
    docker compose -f "$DEPLOY_DIR/$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

    echo -e "${GREEN}Safe restart complete.${NC}"
}

# ==============================================================================
# 查看日志
# ==============================================================================
show_logs() {
    cd "$PROJECT_ROOT"
    docker compose -f "$DEPLOY_DIR/$COMPOSE_FILE" logs -f
}

# ==============================================================================
# 查看状态
# ==============================================================================
show_status() {
    echo -e "${GREEN}OpenFinClaw Prod 服务状态:${NC}"
    echo ""
    docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep -E "finclaw|NAMES"
    echo ""

    # 健康检查
    echo -e "${BLUE}健康检查:${NC}"
    echo -n "  Gateway:    "
    curl -s http://localhost:18789/health && echo "" || echo "FAILED"
}

# ==============================================================================
# 回滚
# ==============================================================================
rollback() {
    confirm_action
    echo -e "${YELLOW}Rolling back to previous version...${NC}"
    cd "$PROJECT_ROOT"

    PREV_COMMIT=$(git rev-parse HEAD~1)
    echo "Rolling back to: $PREV_COMMIT"

    git checkout "$PREV_COMMIT"

    docker compose -f "$DEPLOY_DIR/$COMPOSE_FILE" --env-file "$ENV_FILE" build --no-cache
    docker compose -f "$DEPLOY_DIR/$COMPOSE_FILE" --env-file "$ENV_FILE" down
    docker compose -f "$DEPLOY_DIR/$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

    echo -e "${GREEN}Rollback complete.${NC}"
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
            safe_restart
            ;;
        --logs)
            show_logs
            ;;
        --build)
            confirm_action
            BUILD=true
            start_services
            ;;
        --status)
            show_status
            ;;
        --rollback)
            rollback
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
