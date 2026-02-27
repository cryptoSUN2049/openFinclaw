---
title: FinClaw Commons Hub — 开发技能全景
version: v0.1.0
module: skill
author: 全员
date: 2026-02-27
status: in-progress
---

# FinClaw Commons Hub — 开发技能全景

> 本文档以全栈专家视角，系统梳理本项目的技术栈、架构模式、代码范式与开发规约。
> 目标：新成员 30 分钟内建立项目全局认知。

---

## 一、技术栈速查

| 层次                | 技术                          | 版本   | 用途                            |
| ------------------- | ----------------------------- | ------ | ------------------------------- |
| **Runtime**         | Node.js                       | ≥22    | 服务端运行时                    |
| **Language**        | TypeScript                    | ^5.8   | 全栈类型安全                    |
| **Framework**       | Next.js (App Router)          | 16.1.6 | SSR + RSC 全栈框架              |
| **UI Library**      | React                         | 19.2.3 | 声明式 UI                       |
| **Component Kit**   | shadcn-ui + Radix UI          | -      | 无头组件 + CVA 变体系统         |
| **Styling**         | Tailwind CSS                  | v4     | 原子化 CSS + CSS 变量           |
| **Database**        | PostgreSQL (Supabase)         | -      | 关系型数据库                    |
| **ORM**             | Drizzle ORM                   | ^0.45  | 类型安全 Schema + 迁移          |
| **Auth**            | Supabase Auth + @supabase/ssr | ^0.8   | Email OTP / Google OAuth / Web3 |
| **i18n**            | next-intl                     | -      | URL 段国际化 (en / zh-CN)       |
| **Validation**      | Zod                           | ^3.24  | 运行时 Schema 校验              |
| **Testing**         | Vitest                        | ^3.1   | 单元 + 集成测试 (18 套件)       |
| **Package Manager** | pnpm                          | -      | Workspace 管理                  |
| **Deploy**          | Docker (多阶段) + Nginx       | -      | 容器化生产部署                  |
| **JWT**             | jose                          | -      | RS256 远程 JWKS 验证            |

---

## 二、架构分层

```
┌─────────────────────────────────────────────────────────────┐
│  Presentation — Next.js App Router                          │
│  Server Components → Client Components → shadcn-ui          │
├─────────────────────────────────────────────────────────────┤
│  API Layer — Route Handlers (src/app/api/)                  │
│  Auth / Arena Proxy / Health                                │
├─────────────────────────────────────────────────────────────┤
│  Server Layer — src/server/                                 │
│  HTTP Client (Arena 代理) / JWT 验证 / Registry 读取        │
├─────────────────────────────────────────────────────────────┤
│  Core Engine — old/src/core/  (框架无关，纯 TypeScript)      │
│  FCS Scoring / Lifecycle / Arena (ELO·PK·Pipeline·进化)     │
├─────────────────────────────────────────────────────────────┤
│  Data Layer — Drizzle ORM + JSON 文件                       │
│  PostgreSQL (commons_hub schema, 20 张表)                    │
│  JSON 文件存储 (data/arena/ + data/fcs/ 回退)               │
├─────────────────────────────────────────────────────────────┤
│  External Services                                          │
│  Supabase Auth / OpenAI (安全扫描) / LangGraph (回测)       │
└─────────────────────────────────────────────────────────────┘
```

**核心原则**：Core Engine 层零框架依赖、纯函数、不可变数据结构，可独立于 Next.js 运行和测试。

---

## 三、前端架构技能

### 3.1 路由体系 — App Router + 动态 locale

```
src/app/
├── layout.tsx                        # Root Layout（主题 + i18n Provider）
├── [locale]/                         # URL 语言前缀: /en/... /zh-CN/...
│   ├── page.tsx                     # 首页 (SSR: registry 数据)
│   ├── [slug]/page.tsx              # 条目详情 (动态路由)
│   ├── auth/login/page.tsx          # 登录 (OTP + OAuth)
│   ├── arena/page.tsx               # 排行榜 (SSR → Client 交互)
│   ├── dashboard/layout.tsx         # 仪表盘布局 (Sidebar)
│   ├── entries/page.tsx             # 技能列表
│   └── profile/[slug]/page.tsx      # 用户主页
├── api/                              # Route Handlers
│   ├── auth/callback/route.ts       # OAuth 回调
│   ├── send-otp/route.ts           # 发送验证码
│   ├── verify-otp/route.ts         # 验证 OTP
│   └── arena/                       # Arena 代理层
```

**关键范式**：

- `await props.params` — Next.js 15+ 异步参数 API
- 路由分组：`(public)` 公开页 vs `(app)` 登录后页面
- Server Component 默认，仅在需要交互时分离 Client Component

### 3.2 Server Components 优先策略

| 场景           | 组件类型                        | 原因                        |
| -------------- | ------------------------------- | --------------------------- |
| 首页条目列表   | **Server** → 传 props 给 Client | 数据从 registry.json 读取   |
| Arena 排行榜   | **Server** fetch → Client 渲染  | 服务端调 Arena API          |
| Dashboard 页面 | **Server**                      | Supabase 会话验证           |
| 搜索 / 筛选    | **Client**                      | 需要 useState + useMemo     |
| 主题切换       | **Client**                      | 需要 localStorage + Context |
| 登录表单       | **Client**                      | 表单交互 + Supabase SDK     |

**数据获取模式**：

```typescript
// Server Component 获取 → 传递给 Client Component
export default async function ArenaPage() {
  const { data } = await requestArena<LeaderboardPayload>("/api/arena/leaderboard");
  return <ArenaClient entries={data.entries} />;  // ← Client 只负责 UI 交互
}
```

### 3.3 组件设计系统 — shadcn-ui + CVA

```
src/components/
├── ui/          # 原子组件 (Button, Card, Input, Badge, Sidebar, DropdownMenu)
├── layout/      # Header, UserNav, MobileMenu
├── theme/       # ThemeProvider, ThemeScript (防闪烁), ThemeSwitcher
├── i18n/        # LanguageSwitcher
└── entries/     # EntriesExplorer (业务组件)
```

**Button 变体系统** (class-variance-authority):

```typescript
const buttonVariants = cva("inline-flex items-center ...", {
  variants: {
    variant: {
      default: "bg-pixel-primary shadow-pixel",
      outline: "bg-pixel-card shadow-pixel",
      ghost: "hover:bg-pixel-accent/10",
      pixel: "relative ... before:animate-shimmer", // 闪光动画
    },
    size: { default: "h-10 px-4", sm: "h-8 px-3", lg: "h-12 px-8", icon: "h-10 w-10" },
  },
});
```

### 3.4 视觉设计系统 — 像素卡通风

**色彩变量** (CSS Custom Properties):

```
--pixel-bg: #0d0d12              深色主背景
--pixel-neon-green: #00ff41      霓虹绿（主色调）
--pixel-neon-cyan: #00f0ff       霓虹青（强调色）
--pixel-neon-pink: #ff00aa       霓虹粉（辅助色）
--pixel-text: #f0f0f5            正文白
--pixel-text-muted: #707080      弱化文字
```

**字体**：

- 标题: `Press Start 2P` (像素艺术)
- 正文: `VT323` (等宽终端风)

**动画系统**：

- `animate-blink` — 光标闪烁
- `animate-glitch-1/2` — 文字毛刺 (clip-path)
- `animate-scanline` — CRT 扫描线
- `animate-shimmer` — 按钮光闪
- `animate-neon-pulse` — 霓虹呼吸

**像素阴影** (shadow-pixel)：

```css
--shadow-pixel: 4px 4px 0 var(--pixel-border);
--shadow-pixel-hover: 6px 6px 0 var(--pixel-border-accent);
--shadow-pixel-accent: 4px 4px 0 var(--pixel-neon-green), 0 0 20px var(--pixel-glow-green);
```

### 3.5 国际化 — next-intl

**架构**：

```
messages/en.json      # 英文（主语言）
messages/zh-CN.json   # 简体中文
```

**服务端** — `await getTranslations()`：

```typescript
const t = await getTranslations();
return <h1>{t("hero.title")}</h1>;
```

**客户端** — `useTranslations()` hook：

```typescript
const t = useTranslations();
const locale = useLocale(); // "en" | "zh-CN"
```

**语言切换** — Cookie 持久化 + 页面刷新：

```typescript
document.cookie = `locale=${nextLocale}; path=/; max-age=31536000`;
window.location.reload();
```

### 3.6 主题系统

三档切换：`system` / `dark` / `light`

- `ThemeScript` — `<head>` 内联脚本，读取 localStorage 防 FOUC
- `ThemeProvider` — React Context 全局状态
- `ThemeSwitcher` — 下拉切换组件

---

## 四、后端架构技能

### 4.1 认证链路

#### Email OTP 流程

```
用户输入邮箱 → POST /api/send-otp
  → supabase.auth.signInWithOtp({ email, shouldCreateUser: true })
  → 用户收到 6 位验证码

用户输入验证码 → POST /api/verify-otp
  → supabase.auth.verifyOtp({ email, token, type: "email" })
  → @supabase/ssr 自动写入 session cookie
  → 重定向 → /{locale}/dashboard
```

#### Google OAuth 流程

```
点击 Google 登录 → supabase.auth.signInWithOAuth({ provider: "google" })
  → 跳转 Google 授权
  → 回调 /auth/callback?code=xxx&next=/zh-CN/dashboard
  → supabase.auth.exchangeCodeForSession(code)
  → cookie 写入 → 重定向 next
```

#### JWT 验证 (jose)

```typescript
const jwks = createRemoteJWKSet(new URL("/.well-known/jwks.json", supabaseUrl));
const { payload } = await jwtVerify(token, jwks, { algorithms: ["RS256"] });
```

- 远程 JWKS 端点支持密钥轮换
- 惰性单例缓存，首次调用初始化

### 4.2 Server 层 — 极简代理模式

```typescript
// src/server/arena/http-client.ts — 泛型代理
export async function requestArena<TResponse>(
  path: string,
  options?: { method?: string; body?: string; throwOnError?: boolean },
): Promise<{ status: number; data: TResponse }>;
```

**设计原则**：Server 层只做代理和认证，零业务逻辑。所有业务在 Core Engine 层完成。

### 4.3 API Routes 设计模式

| 模式         | 示例                                 | 说明                                        |
| ------------ | ------------------------------------ | ------------------------------------------- |
| **透明代理** | `arena/submit/route.ts`              | 转发 body → Arena 后端 → 回传 status + data |
| **查询透传** | `arena/leaderboard/route.ts`         | 拼接 URL search params 后转发               |
| **认证流**   | `send-otp/route.ts`                  | 直接调 Supabase SDK                         |
| **动态路由** | `arena/evolution/[entryId]/route.ts` | `await params` 提取路径参数                 |

---

## 五、核心引擎技能

### 5.1 FCS 评分系统

**四维度复合评分** (0-100 分):

| 维度             | 默认权重 | 评估内容                         |
| ---------------- | -------- | -------------------------------- |
| Quality 质量     | 35%      | 测试、文档、CI、Lint、类型检查   |
| Usage 使用       | 30%      | 安装量、活跃安装 (30d)、调用频次 |
| Social 社区      | 20%      | Stars、Forks、Reviews、评分      |
| Freshness 新鲜度 | 15%      | 时间衰减 (半衰期 90d, 指数衰减)  |

**类型特化策略** — Strategy 类权重覆盖:

```
Quality 45% (含 Sharpe 40% + Drawdown 30% + WinRate 15% + CodeQuality 15%)
```

**反作弊三重门控**：

1. 每日 FCS 变化上限 ±5 分
2. 安装速度限流 50/天
3. 最低唯一安装者 3 人

**代码范式**：

```typescript
// 纯函数 — 无副作用、可组合、可测试
export function calculateFcsScore(entry, data, config, previousScore?): FcsScore;
export function applyAntiGaming(newTotal, previousScore, config): number;
```

### 5.2 生命周期状态机

```
🌱 Seedling ──FCS≥30──→ 🌿 Growing ──FCS≥65──→ 🌳 Established
     │                      │                       │
     └── active ←──→ degrading ──(超宽限期)──→ archived
                                                    │
                                              (管理员) delisted
```

**类型特定降级信号**：

| 类型           | 降级条件                                       |
| -------------- | ---------------------------------------------- |
| Strategy       | Sharpe < 0 或 回撤 > 50% 或 180d 无回测        |
| Connector      | 可用率 < 80% 或 错误率 > 10% 或 30d 无健康检查 |
| Skill          | 90d 内零活跃安装                               |
| Knowledge-Pack | 365d 未更新                                    |

**故障恢复**：degrading → active（需 FCS ≥ 30 且降级信号消失）

### 5.3 Arena 竞技引擎

#### 提交管道状态机 (16 种状态)

```
pending → security-scanning → security-passed → reviewing
  → approved → backtest-queued → backtesting → backtest-completed → ready
  │
  ├→ security-failed (终态)
  ├→ rejected (终态)
  ├→ escalated → human-approved / human-rejected (终态)
  └→ backtest-failed (终态)
```

**设计特点**：

- 严格单向转移，`VALID_TRANSITIONS` Map 表控制
- 不可变数据结构（返回新对象）
- `isTerminalStatus()` 终态检测
- `canAdvanceTo(from, to)` 编译期转移校验

#### ELO 评分引擎

```
E(A) = 1 / (1 + 10^((R_B - R_A) / 400))    标准 ELO 公式
K = 32                                       K-factor
applyEloCap(change, dailyChanges, max)       每日变化预算约束
```

#### 策略 PK 引擎 — 四维对决

```
Sharpe (高者胜) + Drawdown (低者胜) + Return (高者胜) + WinRate (高者胜)
→ 多数法则: ≥3 项指标获胜者赢
→ 2-2 → 平局
→ 容差: EPSILON = 0.01 (浮点误差)
→ Best-of-N: 提前终止 (一方达 ceil(N/2) 胜场)
```

#### 排行榜引擎 — 四维复合评分

```
Performance 35% (Sharpe 30% + Return 25% + WinRate 25% + Drawdown 20%)
Popularity  25% (对数缩放: logScale(count, max=10000))
Competition 25% (ELO 标准化)
Community   15% (评分 + 评价 + Fork)
```

**段位**: Bronze (<40) → Silver (40+) → Gold (65+) → Diamond (85+)

#### 安全扫描器 — 双层架构

```
Layer 1: 正则规则预检 (零成本, 8 条禁止模式: eval, child_process, fs, .env...)
  ↓ 无 critical
Layer 2: LLM 深度分析 (OpenAI, 6 类安全风险审查)
  ↓ LLM 不可用
Fallback: 仅规则引擎结果
```

**Fail-closed 原则**：无内容 → 拒绝，LLM 失败 → escalate 人工

#### 风险门控 — First-DENY-wins (5 道关卡)

| Gate               | 检查                                     | 默认阈值 |
| ------------------ | ---------------------------------------- | -------- |
| Mutation Budget    | 24h 内变异次数                           | ≤10      |
| Parameter Drift    | 累计参数漂移                             | ≤0.3     |
| Overfit Detection  | Sharpe>2.5 & Return>50% & DD<5% & WR>70% | 触发拒绝 |
| Mutation Coherence | 变异类型一致性                           | —        |
| Generation Cap     | 进化代数上限                             | ≤20      |

### 5.4 核心设计模式总结

| 模式            | 应用位置                        | 说明                         |
| --------------- | ------------------------------- | ---------------------------- | ------ |
| **纯函数**      | FCS / ELO / PK / Lifecycle      | 无副作用、不可变返回、可组合 |
| **状态机**      | Submission Pipeline / Lifecycle | 严格转移表 + 终态检测        |
| **策略模式**    | FCS 类型特化权重                | `typeOverrides` 覆盖默认权重 |
| **工厂模式**    | Storage Adapter                 | `createStorageAdapter("json" | "pg")` |
| **惰性单例**    | JWKS / OpenAI Client / EventBus | 首次调用初始化，模块级缓存   |
| **代理模式**    | requestArena()                  | 透明转发 + 泛型类型安全      |
| **适配器模式**  | Supabase SSR Cookie             | 框架无关的 Cookie 管理       |
| **事件总线**    | EventBus (SSE 推送)             | 进程内发布/订阅，故障隔离    |
| **Fail-closed** | 安全扫描 / LLM 审核             | 不确定时拒绝或升级           |

---

## 六、数据库技能

### 6.1 Schema 概览 — 20 张表

| 领域             | 表数 | 核心表                                                                                                                                       |
| ---------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 用户与权限       | 3    | users, accounts, memberships                                                                                                                 |
| Commons 技能注册 | 11   | entries, entry_versions, fcs_scores, fcs_history, reviews, comments, stars, install_events, lifecycle_events, author_reputations, fcs_config |
| Arena 竞技       | 6    | arena_submissions, arena_matches, arena_elo_ratings, arena_elo_history, arena_config, arena_user_actions                                     |

### 6.2 Drizzle ORM 关键技巧

**全文搜索** (PostgreSQL tsvector + GIN):

```typescript
searchVector: (tsvector("search_vector"),
  // GIN 索引
  index("entries_search_vector_idx").using("gin", t.searchVector));
```

**JSONB 灵活存储** — 半结构化数据:

```typescript
usageMetrics: jsonb("usage_metrics"),       // { installCount, activeUsers, ... }
backtestResult: jsonb("backtest_result"),    // BacktestResult[]
rounds: jsonb("rounds").default("[]"),      // MatchRound[]
```

**复合约束**:

```typescript
(unique("entries_account_slug_uniq").on(t.accountId, t.slug),
  check("accounts_type_check", sql`${t.type} IN ('personal', 'organization')`));
check("memberships_role_check", sql`${t.role} IN ('owner','admin','publisher','member','viewer')`);
```

**存储适配器**：PG 优先，缺 `DATABASE_URL` 时回退到 JSON 文件。

### 6.3 迁移管理

```
sql/migration/0000-initial-tables.sql   # 14 张核心表 + 外键 + 索引
sql/migration/0001-arena-tables.sql     # 5 张 Arena 表 + 外键 + 索引
sql/init/001-commons-hub-schema.sql     # 合并初始化脚本 (19 表)
```

---

## 七、TypeScript 类型系统技能

### 7.1 深度类型安全

**泛型约束**:

```typescript
async function requestArena<TResponse>(path, options): Promise<{ status: number; data: TResponse }>;
```

**字面量联合类型**:

```typescript
type MarketScenario = "bull" | "bear" | "sideways" | "volatile" | "crash" | "recovery";
type LifecycleTier = "seedling" | "growing" | "established";
type SubmissionStatus = "pending" | "security-scanning" | ... | "ready";  // 16 种
```

**Zod 运行时校验**:

```typescript
const BacktestResultSchema = z
  .object({
    sharpeRatio: z.number(),
    maxDrawdownPct: z.number().min(0).max(100),
    winRatePct: z.number().min(0).max(100),
    tradeCount: z.number().int().nonnegative(),
  })
  .strict(); // 禁止多余字段
```

**Drizzle 推导类型**:

```typescript
type Account = typeof accounts.$inferSelect;
type NewEntry = typeof entries.$inferInsert;
```

### 7.2 严格模式规约

- `strict: true` — 全量严格检查
- 禁止 `any`（Review 红线）
- 所有 API 输入用 Zod 校验
- 所有 DB 查询用 Drizzle 参数化（防 SQL 注入）

---

## 八、测试技能

### 8.1 框架配置

```typescript
// vitest.config.ts
{
  globals: false,
  environment: "node",
  include: ["src/**/*.test.ts"],
  coverage: {
    provider: "v8",
    thresholds: { lines: 70, branches: 70, functions: 70, statements: 70 },
  },
}
```

### 8.2 覆盖率要求

| 模块                               | 最低覆盖率 |
| ---------------------------------- | ---------- |
| 核心引擎 (FCS / Arena / Lifecycle) | ≥ 90%      |
| 工具函数 (utils)                   | ≥ 95%      |
| 新代码整体                         | ≥ 80%      |
| UI 组件                            | ≥ 70%      |

### 8.3 测试模式

```typescript
describe("FCS Scoring Engine", () => {
  it("should calculate quality dimension correctly", () => { ... });
  it("should apply type-specific weight overrides for strategy", () => { ... });
  it("should clamp daily FCS change via anti-gaming", () => { ... });
});
```

- 18 个测试套件, ~200 个测试用例, ~4K LOC
- 纯函数核心 → 极易测试，无需 mock 外部依赖
- Pipeline 状态转移 → 边界条件全覆盖

---

## 九、部署与运维技能

### 9.1 Docker 多阶段构建

```bash
docker compose -f docker-compose.next.yml up -d --build    # 构建 & 启动
docker compose -f docker-compose.next.yml down              # 停止
bash deploy/deploy-hub.sh --update                          # 生产更新
```

### 9.2 环境变量清单

| 变量                                       | 必需 | 说明              | 回退          |
| ------------------------------------------ | ---- | ----------------- | ------------- |
| `NEXT_PUBLIC_SUPABASE_URL`                 | ✅   | Supabase 项目 URL | —             |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`     | ✅   | Supabase 前端公钥 | —             |
| `DATABASE_URL`                             | ❌   | PostgreSQL 连接串 | JSON 文件存储 |
| `ARENA_SERVER_URL`                         | ❌   | Arena HTTP 后端   | 无 Arena 功能 |
| `LITELLM_BASE_URL` / `LITELLM_API_KEY`     | ❌   | LLM 安全扫描      | 仅规则引擎    |
| `LANGGRAPH_BASE_URL` / `LANGGRAPH_API_KEY` | ❌   | 回测 Agent        | Mock 数据     |

**优雅降级设计**：所有可选服务不可用时系统仍可运行，功能逐级降低。

### 9.3 分支与发布策略

```
feat/xxx → dev (Squash Merge) → 集成测试 → main (Merge Commit) → 生产部署
```

---

## 十、技术债务与演进方向

### 10.1 已识别债务

| 问题                          | 优先级 | 建议                           |
| ----------------------------- | ------ | ------------------------------ |
| 缺少 `middleware.ts` 路由保护 | 🔴 高  | 实现 auth + locale 中间件      |
| Dashboard 无服务端 auth 校验  | 🔴 高  | 中间件 + `getUser()` 双重检查  |
| API 无端对端类型安全          | 🟡 中  | 考虑 tRPC 或 Zod 共享 Schema   |
| 无 error.tsx / not-found.tsx  | 🟡 中  | 添加 App Router 错误边界       |
| Arena API 缓存策略缺失        | 🟡 中  | ISR + React Query 客户端缓存   |
| 无结构化日志                  | 🟡 中  | 引入 pino，替代 console        |
| FCS 评分排序索引缺失          | 🔵 低  | `fcs_scores.total` 添加 B-tree |

### 10.2 演进路径

```
Phase 2 (当前) → 补全 Arena UI + 中间件 + 错误边界
Phase 3 → FinCredit 经济 + 策略交易 + 支付集成
Phase 4 → 策略 Fork + 遗传进化 + 多维排行榜
Phase 5 → 增长引擎 + 推荐系统 + 病毒系数
```

---

## 十一、标准提交规约

### 11.1 分支命名

| 前缀        | 用途     | 示例                     |
| ----------- | -------- | ------------------------ |
| `feat/`     | 新功能   | `feat/arena-leaderboard` |
| `fix/`      | Bug 修复 | `fix/auth-redirect-loop` |
| `chore/`    | 工程化   | `chore/upgrade-next-16`  |
| `refactor/` | 重构     | `refactor/fcs-scoring`   |

### 11.2 Conventional Commits

```
<type>(<scope>): <description>

feat(arena): add ELO rating calculation
fix(auth): correct OAuth callback redirect
chore(deps): upgrade supabase-js to v2.98
```

类型：`feat` | `fix` | `chore` | `docs` | `style` | `refactor` | `test` | `ci` | `perf`

### 11.3 Code Review 红线

- [ ] 无 `any` 类型
- [ ] 用户输入经 Zod 校验
- [ ] API 有权限检查
- [ ] SQL 用 Drizzle 参数化
- [ ] 正确拆分 Server / Client Components
- [ ] 新代码测试覆盖 ≥80%
