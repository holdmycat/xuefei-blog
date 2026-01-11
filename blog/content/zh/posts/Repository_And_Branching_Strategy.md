---
title: "SLG 手游仓库管理与分支策略 (Repository & Branching Strategy)"
date: 2026-01-11T10:00:00+08:00
draft: false
tags: ["Build Pipeline", "Git", "Branching Strategy", "DevOps", "SLG"]
---

# SLG 手游仓库管理与分支策略

## 1. 仓库结构设计 (Repository Structure)

为了便于小团队协作与资源统一管理，推荐采用 **Monorepo** 结构。

### 1.1 目录结构

- **FrostLegion_Master/** (Unity Client Project)
  - `Assets/`: 游戏资产
  - `Packages/`: 包管理
  - `ProjectSettings/`: 项目设置
  - **Team Config**: `AddressableUpdateConfig.asset` (团队共享的构建配置)
  - **Local Config**: `AddressableUpdateLocalConfig.asset` (个人本地配置，**.gitignore 忽略**)
  - `Docs/`: 项目文档与规范
- **cdn_server/** (Dockerized CDN Service)
  - `Local/`: 本地开发环境的资源目录
  - `OnlineTest/`: QA/Staging 环境的资源目录
  - `Release/`: 正式环境的资源目录
  - `docker-compose.yml`: CDN 服务启动配置

> **备选方案**: 若团队规模扩大，可将 `client` 和 `cdn_server` 拆分为两个独立的仓库，但在当前阶段 Monorepo 更利于版本的一致性维护。

---

## 2. 分支管理与环境映射 (Branching Model)

我们采用改进版的 GitFlow 模型，严格定义分支与部署环境的映射关系。

### 2.1 核心分支规则

| 分支名称 | 用途 | 允许推向环境 | 权限 |
| :--- | :--- | :--- | :--- |
| **main / master** | **集成分支**，保存随时可发布的代码 | **LocalCDN** (个人测试) | 仅允许 Merge Request 合并，**禁止直接 Push** |
| **dev / feature/*** | **开发分支**，日常功能开发 | **LocalCDN** (个人测试) | 开发者自由读写 |
| **release/x.y.z** | **QA 分支**，功能冻结，用于测试 | **OnlineTest** (QA 环境) | Tech Lead / Build Master 创建 |
| **hotfix/x.y.z** | **热修分支**，线上紧急修复 | **Release** (正式环境) | Tech Lead 创建，修复后合并回 main 和 release |
| **sdk/*** | **SDK 分支**，接入渠道 SDK | **LocalCDN** (独立目录) | 用于特定渠道包的联调 |

---

## 3. 全流程详解 (Workflow)

### 3.1 日常开发 (Development)

1. **分支**: 从 `main` 拉取 `feature/debug-combat`。
2. **构建**: 开发者在本地触发构建，资源推送到 `cdn_server/Local/`。
3. **验证**: 手机/模拟器连接本地 WiFi，测试热更与游戏流程。
4. **合并**: 自测通过后，发起 Pull Request 合并至 `main`。

### 3.2 QA 测试 (Testing)

1. **提测**: 功能开发完毕，从 `main` 创建分支 `release/1.0.0`。
2. **构建**: CI/CD 自动构建，将资源推送到 `OnlineTest` CDN 环境。
3. **验证**: QA 团队下载测试包，连接 OnlineTest 环境进行验收。
4. **修复**: Bug 在该分支直接修复，并重新构建推送到 OnlineTest。

### 3.3 上线发布 (Release)

1. **定版**: QA 验收通过。
2. **构建**: 在 `release/1.0.0` 分支执行 Release 构建，推送到 `Release` CDN 环境。
3. **打标签**:在该 commit 打上 Tag `v1.0.0`。
4. **合并**: 将 `release/1.0.0` 合并回 `main`，并删除分支。

### 3.4 灰度发布 (Gray Release - Optional)

1. **目录**: 在 Release 环境下建立子目录 `Release/gray/`。
2. **构建**: 构建特殊配置的 UpdateManifest，推送到灰度目录。
3. **控制**: 后端通过 UserID 或配置下发不同的 `UpdateManifest` URL，引导部分用户通过灰度目录更新。

### 3.5 版本回滚 (Rollback)

1. **方案 A (Manifest 回滚)**: 修改 `latest.json` 或 `UpdateManifest.json` 的指针，指向上一代的 hash/URL。客户端重启即生效。
2. **方案 B (包体回滚)**: 重新打包上一个稳定 Tag (`v0.9.9`) 的资源，覆盖推送。

### 3.6 线上热更新 (Hotfix)

1. **分支**: 从 Tag `v1.0.0` 拉出 `hotfix/1.0.1`。
2. **修改**: 仅修改 Lua/C# 热更脚本或资源。
3. **构建**: 构建 Patch 包，推送到 `Release` 环境。
4. **版本**: `hotfixVersion` 或 `dllVersion` +1。
5. **合并**: 验证无误后，合并回 `main` 并打 Tag `v1.0.1`。

---

## 4. 关键操作与遗漏补充 (Best Practices)

### 4.1 权限与安全

* **CODEOWNERS**: 对 `AddressableUpdateConfig.asset` 等关键配置设置代码所有者，强制 Code Review。
- **分支保护**: 锁定 `main` 和 `release/*` 分支，防止误操作。

### 4.2 版本与产物

* **版本锁定**: 在 `release` 和 `hotfix` 分支，严格锁定 `AppVersion`，防止底包版本飘移。
- **产物归档**: CI 构建时，务必保留 Build Log、Symbols (dSYM/PDB)、以及对应的 Git Commit Hash，便于崩溃堆栈还原。

### 4.3 多端与渠道隔离

* **Platform 隔离**: 同一版本下，严格区分 `Android/` 和 `iOS/` 目录。
- **渠道隔离**: 若接入不同渠道 SDK，建议使用 `sdk/xiaomi` 等分支，并在 CDN 上建立独立子目录 `channel_xiaomi/`，避免资源混用。

### 4.4 配置管理

* **Profile 初始化**: 确保每个环境 (Local/Online/Release) 的 Addressables Profile 是固定的，不要在构建时动态修改 Profile 内容，而是切换 Profile ID。
- **开关控制**: 灰度、维护、强更等开关，建议集成在 `latest.json` 或单独的 `server_config.json` 中，由后端接口控制，而非写死在客户端。
