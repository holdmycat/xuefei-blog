---
title: "Git Worktree vs Clone：大型项目多工程并行开发方案对比"
date: 2026-01-11T12:00:00+08:00
draft: false
tags: ["Git", "Workflow", "Unity", "DevOps", "Efficiency"]
---

# Git Worktree vs Clone：大型项目多工程并行开发方案对比

## 1. 问题背景 (The Problem)

在大型 Unity 项目（如 SLG 手游）开发中，我们经常面临以下场景：

1. **并行任务**: 正在 `feature/combat` 分支开发新战斗功能，突然需要紧急修复 `hotfix/crash` 线上崩溃。
2. **Code Review**: 仅仅为了运行一下同事的 PR 代码，不想破坏当前正在开发的工作区。
3. **Library 噩梦**: Unity 项目的 `Library` 目录通常巨大（几十 GB）。在同一个仓库内切换分支（Switch Branch），会导致 Unity 重新导入资源（Reimport），耗时可能长达数十分钟甚至更久。

为了解决这个问题，开发者通常会寻求“多工程目录”方案。主要有两种选择：`git clone` 和 `git worktree`。

---

## 2. 方案对比 (Comparison)

### 2.1 传统方案：多次 Git Clone

最直观的做法是在磁盘上克隆多个仓库副本。

* **结构**:
  * `/Project_Main/` (.git folder: 30GB)
  * `/Project_Hotfix/` (.git folder: 30GB)
  * `/Project_Review/` (.git folder: 30GB)
* **优点**:
  * 物理隔离彻底，互不影响。
* **缺点**:
  * **磁盘爆炸**: 每个副本都有完整的 `.git` 历史记录。对于数年历史的大型项目，`.git` 目录可能高达数十 GB。三个副本就是三倍的占用。
  * **同步繁琐**: 在 `Main` 仓库 fetch 了最新的远端代码，`Hotfix` 仓库并不知道，必须进入每个仓库单独 `git fetch`。
  * **Hook 冗余**: 如果使用了 git hooks，需要为每个仓库单独配置。

### 2.2 推荐方案：Git Worktree

`git worktree` 是 Git 官方提供的功能，允许一个仓库链接多个工作目录 (Working Trees)。

* **结构**:
  * `/Project_Main/` (主仓库, .git folder: 30GB)
    * `.git/` (包含 objects, refs)
  * `/Project_Main_Hotfix/` (Worktree, .git file pointing to Main)
  * `/Project_Main_Review/` (Worktree, .git file pointing to Main)
* **特点**:
  * **共享历史**: 所有 Worktree 共享同一个 `.git` 目录（Object Database）。**磁盘占用几乎不增加**（只增加当前 checkout 的源码文件大小）。
  * **状态同步**: 在主仓库 `git fetch origin`，所有 Worktree 都能立即看到最新的远端分支。
  * **极速创建**: 创建一个新 Worktree 秒级完成（不涉及网络传输，只需 checkout 文件）。

---

## 3. 为什么 Git Worktree 更适合大型项目？

### 3.1 磁盘空间节省 (Disk Space Efficiency)

对于美术资源繁重的 SLG 项目，`.git` 目录往往巨大。

* **Clone**: 50GB Repo * 3 Copies = **150GB**
* **Worktree**: 50GB Repo + (Checkouts) = **55GB** (约)
节省近 **66%** 的空间，这对于 SSD 容量有限的开发机至关重要。

### 3.2 完美的 Unity Library 隔离 (Library Isolation)

这是 Unity 开发的核心痛点。

* **单仓库切分支**: 必须修改 `Library`，触发 Reimport，极慢。
* **Worktree**: 每个 Worktree 是一个独立的文件夹，因此拥有独立的 `Library` 目录。
  * Folder A (Feature): `Library` 对应 Feature 分支资源。
  * Folder B (Hotfix): `Library` 对应 Release 分支资源。
  * **切换操作**: 只是关掉 Unity A，打开 Unity B。**零等待**。

### 3.3 分支管理一致性 (Branch Management)

Git 强制要求同一个分支不能同时被两个 Worktree checkout。这避免了你在 A 目录改了文件，却在 B 目录提交了同一分支的冲突风险。它强制你在逻辑上保持清晰。

---

## 4. 最佳实践流程 (Best Practices)

### 4.1 目录结构建议

推荐采用“平级结构”而非“嵌套结构”，避免 `.gitignore` 问题。

```text
/Users/domi/SoulMaster/          <-- 根目录
├── .git/                        <-- 实际的 .git 目录 (由 Master 持有)
├── FrostLegion_Master/          <-- 主 Worktree (main 分支)
├── FrostLegion_Hotfix/          <-- 辅助 Worktree (hotfix 分支)
└── FrostLegion_Feature/         <-- 辅助 Worktree (feature/xxx 分支)
```

### 4.2 常用命令速查

```bash
# 1. 在主仓库中添加一个新的 Worktree
# 语法: git worktree add <path> <branch>
git worktree add ../FrostLegion_Hotfix hotfix/1.0.1

# 2. 列出当前所有 Worktree
git worktree list

# 3. 移除一个 Worktree (物理删除文件夹后运行此命令清理引用)
git worktree prune
# 或者规范移除
git worktree remove ../FrostLegion_Hotfix

# 4. 修复：如果 Worktree 移动了位置导致不可用
git worktree repair
```

### 4.3 配合 Unity 的注意事项

* **Symbolic Link**: 高级用户可以尝试将通用的 `Library/PackageCache` 等不常变动的部分做软链接，进一步节省空间（但有风险，建议直接由 Unity 重新生成各自的 Library）。
* **Tooling**: 建议编写简单的 Shell/Python 脚本（如 `add_worktree.sh`），自动完成 `git worktree add` 后，顺便创建 `LocalConfig` 或拷贝基础配置，实现一键搭建环境。

---

## 5. 总结

在“多分支并行开发”成为常态的今天，**Git Worktree** 是比 Git Clone 更现代、更高效的解决方案。它以最小的磁盘代价，换取了最高效的**环境隔离**（Library 隔离）和**状态同步**。

对于动辄几十 GB 的 SLG 游戏项目，Git Worktree 几乎是提升开发幸福感的必选项。
