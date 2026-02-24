#!/bin/bash
# ==============================================================================
# OpenFinClaw 服务器一键部署脚本
# ==============================================================================
# 在全新服务器上执行，自动完成: 依赖检查 → 代码拉取 → 构建 → 启动 → 健康检查

set -e

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 配置
REPO_URL="${FINCLAW_REPO_URL:-https://github.com/cryptoSUN2049/openFinclaw.git}"
INSTALL_DIR="${FINCLAW_INSTALL_DIR:-/home/finclaw}"
BRANCH="${FINCLAW_BRANCH:-main}"

# ==============================================================================
# 帮助信息
# ==============================================================================
show_help() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "OpenFinClaw 服务器一键部署"
    echo ""
    echo "Options:"
    echo "  --env local     部署本地开发环境 (默认)"
    echo "  --env test      部署测试环境"
    echo "  --env prod      部署生产环境"
    echo "  --skip-deps     跳过依赖安装"
    echo "  --help          显示帮助"
    echo ""
    echo "Environment Variables:"
    echo "  FINCLAW_REPO_URL      Git 仓库地址"
    echo "  FINCLAW_INSTALL_DIR   安装目录 (默认: /home/finclaw)"
    echo "  FINCLAW_BRANCH        Git 分支 (默认: main)"
}

# ==============================================================================
# 检查并安装 Docker
# ==============================================================================
install_docker() {
    if command -v docker &> /dev/null; then
        echo -e "${GREEN}Docker already installed: $(docker --version)${NC}"
        return
    fi

    echo -e "${BLUE}Installing Docker...${NC}"
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker && systemctl start docker
    echo -e "${GREEN}Docker installed successfully${NC}"
}

# ==============================================================================
# 检查并安装 Git
# ==============================================================================
install_git() {
    if command -v git &> /dev/null; then
        echo -e "${GREEN}Git already installed: $(git --version)${NC}"
        return
    fi

    echo -e "${BLUE}Installing Git...${NC}"
    if command -v apt-get &> /dev/null; then
        apt-get update && apt-get install -y git
    elif command -v yum &> /dev/null; then
        yum install -y git
    elif command -v dnf &> /dev/null; then
        dnf install -y git
    else
        echo -e "${RED}Cannot install git: unsupported package manager${NC}"
        exit 1
    fi
    echo -e "${GREEN}Git installed successfully${NC}"
}

# ==============================================================================
# 克隆或更新代码
# ==============================================================================
setup_code() {
    if [ -d "$INSTALL_DIR/.git" ]; then
        echo -e "${BLUE}Updating existing code...${NC}"
        cd "$INSTALL_DIR"
        git fetch origin
        git checkout "$BRANCH"
        git pull origin "$BRANCH"
    else
        echo -e "${BLUE}Cloning repository...${NC}"
        mkdir -p "$(dirname "$INSTALL_DIR")"
        git clone -b "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
        cd "$INSTALL_DIR"
    fi
    echo -e "${GREEN}Code ready at: $INSTALL_DIR${NC}"
}

# ==============================================================================
# 配置环境变量
# ==============================================================================
setup_env() {
    local env="$1"

    case "$env" in
        local)
            ENV_FILE="deploy/.env.local"
            ;;
        test)
            ENV_FILE="deploy/.env.test"
            ;;
        prod)
            ENV_FILE=".env"
            ;;
    esac

    if [ ! -f "$INSTALL_DIR/$ENV_FILE" ]; then
        echo -e "${YELLOW}Creating $ENV_FILE from template...${NC}"
        cp "$INSTALL_DIR/deploy/.env.example" "$INSTALL_DIR/$ENV_FILE"
        echo -e "${YELLOW}Please edit $INSTALL_DIR/$ENV_FILE with your settings${NC}"
        echo -e "${YELLOW}Then re-run this script${NC}"
        exit 0
    fi

    echo -e "${GREEN}Using env file: $ENV_FILE${NC}"
}

# ==============================================================================
# 部署服务
# ==============================================================================
deploy() {
    local env="$1"
    cd "$INSTALL_DIR"

    echo -e "${BLUE}Deploying OpenFinClaw ($env)...${NC}"

    case "$env" in
        local)
            bash deploy/scripts/start_local.sh --build
            ;;
        test)
            bash deploy/scripts/deploy_test.sh --build
            ;;
        prod)
            bash deploy/scripts/deploy_prod.sh --build
            ;;
    esac
}

# ==============================================================================
# 健康检查
# ==============================================================================
health_check() {
    local env="$1"
    local port

    case "$env" in
        local)  port=18789 ;;
        test)   port=8020 ;;
        prod)   port=18789 ;;
    esac

    echo -e "${BLUE}Waiting for services to start...${NC}"
    sleep 10

    echo -e "${BLUE}Running health checks...${NC}"

    # Gateway
    local retries=5
    while [ $retries -gt 0 ]; do
        if curl -sf --connect-timeout 5 "http://localhost:$port/" > /dev/null 2>&1; then
            echo -e "${GREEN}Gateway (port $port): OK${NC}"
            break
        fi
        retries=$((retries - 1))
        if [ $retries -eq 0 ]; then
            echo -e "${YELLOW}Gateway (port $port): not responding yet (may still be starting)${NC}"
        else
            sleep 5
        fi
    done

    # Docker containers
    echo ""
    echo -e "${GREEN}Running containers:${NC}"
    docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep -E "finclaw|NAMES"
}

# ==============================================================================
# 主逻辑
# ==============================================================================
main() {
    local env="local"
    local skip_deps=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --env)
                env="$2"
                shift 2
                ;;
            --skip-deps)
                skip_deps=true
                shift
                ;;
            --help)
                show_help
                exit 0
                ;;
            *)
                echo -e "${RED}Unknown option: $1${NC}"
                show_help
                exit 1
                ;;
        esac
    done

    # 验证环境参数
    case "$env" in
        local|test|prod) ;;
        *)
            echo -e "${RED}Invalid environment: $env (use local/test/prod)${NC}"
            exit 1
            ;;
    esac

    echo "=============================================="
    echo "  OpenFinClaw Server Deployment"
    echo "  Environment: $env"
    echo "  Install dir: $INSTALL_DIR"
    echo "=============================================="
    echo ""

    # 安装依赖
    if [ "$skip_deps" = false ]; then
        install_docker
        install_git
    fi

    # 准备代码
    setup_code

    # 配置环境
    setup_env "$env"

    # 部署
    deploy "$env"

    # 健康检查
    health_check "$env"

    echo ""
    echo "=============================================="
    echo -e "  ${GREEN}OpenFinClaw deployed successfully!${NC}"
    echo "=============================================="
}

main "$@"
