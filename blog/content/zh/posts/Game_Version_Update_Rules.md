---
title: "游戏版本号更新管理规则 (Game Version Update Rules)"
date: 2026-01-11T14:40:00+08:00
draft: false
tags: ["Build Pipeline", "Versioning", "Addressables", "Hotfix", "DevOps"]
---

# 游戏版本号更新管理规则 (Game Version Update Rules)

> **适用范围**: 本文档适用于 **LocalCDN / OnlineTest** 流程，以及定义其与正式 **release/hotfix** 发布基线的关系。

## 1. AppVersion（发布基线版本）

* **锁定原则**: `AppVersion` **仅在** `release/*` 或 `hotfix/*` 分支上确定并锁定。这是版本的锚点。
* **数据来源**: 运行时读取 Unity Player Settings 中的 `Bundle Version` (`Application.version`)。
* **开发环境行为**: **LocalCDN / OnlineTest 不修改 AppVersion**。
  * 即使是在本地开发（`dev` 分支），打出来的包也应当跟随当前的主线或发布基线版本（即当前锁定的 `AppVersion`）。
  * **禁止**在日常开发测试中随意变更 `AppVersion`，因为这会导致热更路径变更，产生不必要的全量包更新需求。

## 2. BuildRevision（构建修订号）

* **自动递增**: **每次出包（Build）自动 +1**。这是一个流水线计数器。
* **重置规则**: **仅当 AppVersion 变化时清零**。
  * 例如：从 `1.2.0` 切换到 `1.3.0` 时，`BuildRevision` 重置为 0 或 1（具体取决于工程约定）。
* **LocalCDN 特例**:
  * 在 LocalCDN 模式下，`BuildRevision` **仅对个人自测有效**。
  * 它的作用是区分**你本机/你账号**进行的多次自测构建。
  * **不作为团队共享的强一致版本依据**，不得影响其他开发者的版本判断。

## 3. 内容 / DLL / Catalog 版本（构建产物驱动版本）

这些版本号 (`contentVersion` / `dllVersion` / `catalogVersion`) 是热更的核心，它们应当**由构建产物变化驱动**。

* **递增规则**:
  * 构建输出发生变化（如 Hash 变动、文件大小变动） → 对应版本递增（按现有自动增长逻辑）。
  * 如果没有实质内容变化，版本号保持不变（幂等性）。
* **重置规则**:
  * **当 AppVersion 变化时**，上述所有热更版本号 **统一重置为 1**。
  * **原因**: 新的 `AppVersion` 意味着一个新的“初始包”，这个初始包自带的内容即为该大版本的“第 1 版”。
  * **隔离保障**: CDN 文件夹命名规则为 `{AppVersion}_c{contentVersion}_d{dllVersion}`，这天然保证了不同 AppVersion 之间的资源物理隔离，不会发生覆盖冲突。

## 4. LocalCDN 版本保留与清理策略

为了防止本地测试环境磁盘爆炸，需要限制历史版本保留数量。

* **保留策略**: **仅保留最近 N 次**版本目录（建议默认 `N = 5`）。
* **清理机制**: 当版本总数 **超过 N** 时，构建脚本应自动清理最旧的版本目录。
* **索引文件**: `latest.json` **始终指向最新构建的版本**。
  * 它是 LocalCDN 的“入口索引”。
  * 客户端或测试工具在 Local 模式下，默认请求 `latest.json` 来定位最新可用的热更版本。
