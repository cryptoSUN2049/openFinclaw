---
title: 开发文档索引
version: v0.1.0
module: develop
author: 全员
date: 2026-02-27
status: in-progress
---

# 开发文档索引

本目录 (`develop/`) 是 FinClaw Commons Hub 项目的**核心开发文档库**，涵盖开发流程、编码规范、模块规划与进度跟踪。所有开发相关的文档统一收录于此，确保团队成员能快速定位所需信息。

> **适用范围**：本目录下的文档主要适用于 **FinClaw Commons Hub Web 项目**（Next.js/Supabase 技术栈）。OpenFinClaw 金融扩展（`extensions/fin-*`）的开发请参考项目根目录的 `CLAUDE.md` 和 `FORK_DELTA.md`。

## 快速导航

| 文档                                 | 说明                                                                                     | 状态        |
| ------------------------------------ | ---------------------------------------------------------------------------------------- | ----------- |
| [skill.md](./skill.md)               | 开发技能 & 标准提交流程 — Conventional Commits、测试要求、Code Review 检查清单、部署流程 | draft       |
| [开发指南.md](./开发指南.md)         | 环境搭建 + Git 工作流 + 项目结构 + 编码规范 + 调试技巧                                   | draft       |
| [功能模块清单.md](./功能模块清单.md) | 全部功能模块的规划状态、负责人、优先级及 Roadmap Phase                                   | in-progress |
| [开发进度表/](./开发进度表/)         | 各模块的详细开发进度记录（按模块拆分）                                                   | planned     |
| [test/](./test/)                     | 测试记录 — 单元测试、集成测试、E2E 测试报告                                              | planned     |
| [review/](./review/)                 | Code Review 记录 — PR 审核意见与改进跟踪                                                 | in-progress |

## 关联文档

| 目录                              | 说明                                   |
| --------------------------------- | -------------------------------------- |
| [docs/](../docs/)                 | 产品设计、战略规划、技术文档、竞品分析 |
| [FORK_DELTA.md](../FORK_DELTA.md) | OpenFinClaw 与上游 OpenClaw 的差异清单 |

## 文档维护约定

1. 所有 `.md` 文件必须包含 YAML frontmatter（title, version, module, author, date, status）。
2. 状态值约定：`draft` → `in-progress` → `review` → `stable`。
3. 文档更新时同步修改 `date` 和 `version` 字段。
4. 使用 Conventional Commits 记录文档变更：`docs(develop): 描述`。
