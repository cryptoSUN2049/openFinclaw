<div align="center">

<img src="https://img.shields.io/badge/OpenFinClaw-金融AI伙伴-0066FF?style=for-the-badge&logoColor=white" alt="OpenFinClaw" height="40">

# OpenFinClaw

### 你的开源金融 AI 伙伴

**首个开源、可自我进化、用户数据自主的金融 AI 管家，陪伴你的完整金融生命周期。**

<p>
  <a href="./README.md"><img alt="English" src="https://img.shields.io/badge/English-blue?style=flat-square"></a>
  <a href="./README.zh-CN.md"><img alt="简体中文" src="https://img.shields.io/badge/简体中文-blue?style=flat-square"></a>
  <a href="./README.ja.md"><img alt="日本語" src="https://img.shields.io/badge/日本語-blue?style=flat-square"></a>
</p>

<p>
  <a href="https://github.com/cryptoSUN2049/openFinclaw/stargazers"><img src="https://img.shields.io/github/stars/cryptoSUN2049/openFinclaw?style=flat-square&logo=github" alt="Stars"></a>
  <a href="https://github.com/cryptoSUN2049/openFinclaw/network/members"><img src="https://img.shields.io/github/forks/cryptoSUN2049/openFinclaw?style=flat-square&logo=github" alt="Forks"></a>
  <a href="https://github.com/cryptoSUN2049/openFinclaw/issues"><img src="https://img.shields.io/github/issues/cryptoSUN2049/openFinclaw?style=flat-square" alt="Issues"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square" alt="MIT License"></a>
</p>

<p>
  <a href="https://openfinclaw.ai">官网</a> ·
  <a href="#核心特性">特性</a> ·
  <a href="#快速开始">快速开始</a> ·
  <a href="#路线图">路线图</a> ·
  <a href="#参与贡献">贡献</a> ·
  <a href="https://github.com/openclaw/openclaw">上游项目：OpenClaw</a>
</p>

</div>

---

## OpenFinClaw 是什么？

OpenFinClaw 是 [OpenClaw](https://github.com/openclaw/openclaw) 的**金融领域特化版本**。我们在 OpenClaw 久经考验的 Agent 基础设施之上 —— 常驻网关、25+ 消息渠道、插件系统、向量记忆、多模型支持 —— 构建深度金融智能层。

**我们的使命**：让每个人都拥有一个主动、私密、持续进化、真正属于你的 AI 金融伙伴。

```
传统金融工具                    OpenFinClaw
───────────                    ──────────────────────
你查询，它回应            →    它观察、它学习、它行动
千人一面的建议            →    深度个性化，专属于你
数据锁在各个平台          →    你的数据、你的设备、你的规则
功能一成不变              →    技能自我进化
工具各自为政              →    统一的全生命周期伙伴
```

## 为什么选择 OpenFinClaw？

2026 年，AI Agent 正在从「你调用的工具」转变为「与你共生的伙伴」。投资、预算、税务规划、交易、退休 —— 金融生活太复杂、太个人化，通用聊天机器人和静态仪表盘无法胜任。

OpenFinClaw 的不同之处：

- **7x24 常驻** — 通过 OpenClaw 的 Gateway 在你的设备上全天候运行。全球市场永不休息，你的金融伙伴也是。
- **自我进化** — Agent 可以在运行时编写并热加载新技能（JIT 插件）。市场变了？你的 Agent 几分钟内就能适应，而非等待数月的版本更新。
- **记忆驱动** — 四层上下文系统（Soul → Tools → User → Session），记住你的风险偏好、历史决策和财务目标，贯穿每一次对话。
- **隐私为先** — 所有数据留在你的设备上。向量记忆、交易凭证、财务历史 —— 除非你主动选择，否则不会外传。
- **开源透明** — 没有供应商锁定。审计代码、fork 它、扩展它。这是你的金融主权。

## 核心特性

### 金融核心能力

| 特性 | 说明 | 状态 |
|------|------|------|
| **可进化金融技能** | 自我迭代的技能插件：投资组合分析、风险评估、税务优化、预算管理等。技能随时间成长和适应。 | 规划中 |
| **主动式金融管家** | 不只是被动回应 —— 主动监控市场、定期健康检查、发送预知性提醒、自动生成报告。 | 规划中 |
| **自主交易 (CCXT)** | 通过 Hyperliquid、Binance、OKX、Bybit 执行交易，配备人工审批安全护栏。 | 规划中 |
| **深度金融专家 SDK** | 专业级分析、机构级洞察、量化工具，通过注册 SDK 密钥接入。 | 规划中 |
| **智能信息流 SDK** | 策展实时市场情报、情绪分析、财报数据、宏观指标，通过注册 SDK 密钥接入。 | 规划中 |
| **用户记忆引擎** | 记住你的财务画像、风险偏好、投资倾向和决策历史。每次交互都变得更聪明。 | 规划中 |

### 高级智能

| 特性 | 说明 | 状态 |
|------|------|------|
| **自我复盘引擎** | 每次交易/决策后，自动复盘结果 vs 预期，识别认知偏差，更新自身决策参数。 | 规划中 |
| **预知性提醒** | 超越价格提醒 —— 检测巨鲸动向、关联历史模式、基于消费行为预测预算超支。 | 规划中 |
| **行为金融守护** | 检测情绪化交易模式（报复性交易、FOMO、恐慌抛售），提供冷静的循证引导。 | 规划中 |
| **金融数字孪生** | 模拟你的完整财务未来 —— 「如果我买这套房？」「何时能退休？」「这笔投资如何改变我的 10 年前景？」 | 规划中 |
| **多 Agent 金融团队** | 研究员、交易员、风控官、合规审计员 —— 各有独立人格、权限和记忆，作为你的专属金融团队协同工作。 | 规划中 |
| **监管合规自动驾驶** | 自动税务事件追踪、大额持仓报告、跨境合规检查（CRS/FATCA）、审计追踪生成。 | 规划中 |

### 基于 OpenClaw 的底座能力

以上所有功能都构建在 OpenClaw 的成熟基础设施之上：

- **25+ 消息渠道** — WhatsApp、Telegram、Slack、Discord、Signal、iMessage、Teams 等
- **常驻网关** — 7x24 守护进程，配置热重载，无需重启
- **Pi 原语引擎** — 4 个核心原语（Read/Write/Edit/Bash）+ LLM = 无限组合能力
- **JIT 插件系统** — Agent 可在运行时编写并热加载新的 TypeScript 插件
- **向量记忆** — 基于 sqlite-vec 的混合搜索（语义 + 关键词），支持长期记忆
- **多模型支持** — Claude、GPT、Gemini、Ollama 等 10+ 提供商，自动故障转移
- **五层安全体系** — 网络 → 认证 → 渠道 → 执行 → 设备，配备人工审批流
- **浏览器自动化** — 基于 Playwright，无头 + 扩展中继模式，覆盖无 API 的数据源

## 架构

```
┌──────────────────────────────────────────────────────────────┐
│                      OpenFinClaw                              │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                 金融智能层                               │  │
│  │                                                        │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │  │
│  │  │  金融    │ │  主动式  │ │  交易    │ │  自我    │ │  │
│  │  │  技能    │ │  管家    │ │  桥接    │ │  复盘    │ │  │
│  │  │  引擎    │ │  服务    │ │ (CCXT)   │ │  引擎    │ │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │  │
│  │  │  专家    │ │  智能    │ │  行为    │ │  金融    │ │  │
│  │  │  SDK     │ │  信息流  │ │  守护    │ │  记忆    │ │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ │  │
│  └────────────────────────────────────────────────────────┘  │
│                            │                                  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │              OpenClaw 核心基础设施                       │  │
│  │                                                        │  │
│  │  网关 · Agent 运行时 · 渠道 · 记忆 · 插件              │  │
│  │  安全 · 定时任务 · 浏览器 · 模型 · CLI · 移动端        │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
        ┌─────┴─────┐  ┌─────┴─────┐  ┌─────┴─────┐
        │  CEX/DEX  │  │  传统金融  │  │  个人理财 │
        │   交易所   │  │   市场    │  │           │
        └───────────┘  └───────────┘  └───────────┘
```

## 支持的交易所 (通过 CCXT)

| 交易所 | 现货 | 合约 | 期权 | 状态 |
|--------|------|------|------|------|
| Hyperliquid | 是 | 是 | - | 规划中 |
| Binance | 是 | 是 | 是 | 规划中 |
| OKX | 是 | 是 | 是 | 规划中 |
| Bybit | 是 | 是 | - | 规划中 |
| _更多 CCXT 支持..._ | - | - | - | 未来 |

## 快速开始

> OpenFinClaw 处于早期开发阶段。请 Star 并 Watch 本仓库以关注进展。

```bash
# 前置要求：Node >= 22
git clone https://github.com/cryptoSUN2049/openFinclaw.git
cd openFinclaw
pnpm install
```

## 路线图

### 第一阶段 — 基础 `2026 Q1`
- [x] Fork OpenClaw 核心，确立项目愿景
- [ ] 金融技能插件框架
- [ ] CCXT 交易桥接（Hyperliquid、Binance、OKX、Bybit）
- [ ] 基础投资组合追踪与报告
- [ ] 用户金融画像记忆系统

### 第二阶段 — 智能 `2026 Q2`
- [ ] 深度金融专家 SDK 集成
- [ ] 智能信息流 SDK
- [ ] 自我复盘引擎（交易日志 + 认知偏差检测）
- [ ] 预知性提醒系统
- [ ] 行为金融守护

### 第三阶段 — 主动 `2026 Q3`
- [ ] 主动监控与预警引擎
- [ ] 自动化财务报告（日报/周报/月报）
- [ ] 跨交易所投资组合管理
- [ ] 金融数字孪生模拟
- [ ] 多 Agent 金融团队

### 第四阶段 — 生态 `2026 Q4`
- [ ] 社区金融技能市场
- [ ] 第三方数据提供商集成
- [ ] DeFi 跨链操作
- [ ] 监管合规自动驾驶
- [ ] 高级策略回测与模拟

## 设计原则

1. **用户至上** — 每个功能服务于用户的财务福祉，而非参与度指标。
2. **隐私为先** — 金融数据留在你的设备上，没有例外。
3. **开源透明** — 核心引擎开源；高级数据/专家服务通过 SDK 密钥提供。
4. **安全护栏** — 交易操作始终需要用户明确授权，绝不静默交易。
5. **持续进化** — 技能和能力通过社区贡献和自我迭代不断成长。
6. **可解释性** — 展示推理过程，而非仅展示结果。用户应理解每个建议的原因。

## 致谢

OpenFinClaw 自豪地构建于 [**OpenClaw**](https://github.com/openclaw/openclaw) 之上，由 [Peter Steinberger](https://github.com/steipete) 和 OpenClaw 社区创建。我们深深感谢他们对开放、隐私优先、始终在线 AI 助手的愿景 —— 它为金融 AI 伙伴提供了完美的基础设施。

本项目秉持开源精神：站在巨人的肩膀上构建，回馈生态系统，并保持工作的开放性让他人得以在此基础上继续创新。

**上游项目**：[github.com/openclaw/openclaw](https://github.com/openclaw/openclaw) · [openclaw.ai](https://openclaw.ai) · [docs.openclaw.ai](https://docs.openclaw.ai)

## 参与贡献

OpenFinClaw 是一个开放社区项目。我们欢迎各种形式的贡献：

- **金融技能** — 为特定金融领域构建和分享技能插件
- **交易所集成** — 帮助扩展 CCXT 桥接覆盖范围
- **数据连接器** — 接入新的金融数据源
- **文档翻译** — 改进指南、教程和多语言翻译
- **问题反馈** — 帮助我们发现和修复问题

详见 [CONTRIBUTING.md](CONTRIBUTING.md) 了解开发环境搭建和贡献指南。

## 社区

- GitHub Issues：[报告问题和功能请求](https://github.com/cryptoSUN2049/openFinclaw/issues)
- GitHub Discussions：[提问和分享想法](https://github.com/cryptoSUN2049/openFinclaw/discussions)

<!--
## Star 增长趋势

[![Star History Chart](https://api.star-history.com/svg?repos=cryptoSUN2049/openFinclaw&type=Date)](https://star-history.com/#cryptoSUN2049/openFinclaw&Date)
-->

## 许可证

[MIT 许可证](LICENSE) — 与上游 OpenClaw 保持一致。

---

<div align="center">

**基于 [OpenClaw](https://github.com/openclaw/openclaw) 用心构建** · **你的财务、你的数据、你的规则。**

</div>
