#!/bin/bash
# ==============================================================================
# OpenFinClaw 本地开发启动脚本
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DEPLOY_DIR="$PROJECT_ROOT/deploy"

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 默认配置
ENV_FILE="deploy/.env.local"
COMPOSE_FILE="docker-compose.local.yml"

# ==============================================================================
# 帮助信息
# ==============================================================================
show_help() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "OpenFinClaw 本地开发环境"
    echo ""
    echo "Options:"
    echo "  --stop          停止所有服务"
    echo "  --restart       重启所有服务"
    echo "  --logs          查看日志"
    echo "  --build         强制重新构建"
    echo "  --status        查看服务状态"
    echo "  --help          显示帮助"
    echo ""
    echo "Examples:"
    echo "  $0              启动服务"
    echo "  $0 --stop       停止服务"
    echo "  $0 --logs       查看日志"
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
# 启动服务
# ==============================================================================
start_services() {
    echo -e "${GREEN}Starting OpenFinClaw services...${NC}"

    cd "$PROJECT_ROOT"

    # 检查环境变量文件
    if [ ! -f "$ENV_FILE" ]; then
        echo -e "${YELLOW}Warning: $ENV_FILE not found, copying from deploy/.env.example${NC}"
        cp "$DEPLOY_DIR/.env.example" "$ENV_FILE"
    fi

    # 创建网络
    create_network

    # 启动服务
    if [ "$BUILD" = true ]; then
        docker compose -f "$DEPLOY_DIR/$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --build
    else
        docker compose -f "$DEPLOY_DIR/$COMPOSE_FILE" --env-file "$ENV_FILE" up -d
    fi

    echo ""
    echo -e "${GREEN}Services started!${NC}"
    echo ""
    echo "  Gateway (WS + UI):  http://localhost:18789"
    echo "  Redis:              localhost:6381"
    echo "  PostgreSQL:         localhost:5434"
    echo ""
}

# ==============================================================================
# 停止服务
# ==============================================================================
stop_services() {
    echo -e "${YELLOW}Stopping OpenFinClaw services...${NC}"
    cd "$PROJECT_ROOT"
    docker compose -f "$DEPLOY_DIR/$COMPOSE_FILE" down
    echo -e "${GREEN}Services stopped.${NC}"
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
    echo -e "${GREEN}OpenFinClaw 服务状态:${NC}"
    echo ""
    docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep -E "finclaw|NAMES"
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
            start_services
            ;;
        --logs)
            show_logs
            ;;
        --build)
            BUILD=true
            start_services
            ;;
        --status)
            show_status
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
