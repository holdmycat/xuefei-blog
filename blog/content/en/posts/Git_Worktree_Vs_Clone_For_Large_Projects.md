---
title: "Git Worktree vs Clone: Parallel Development Strategies for Large Projects"
date: 2026-01-11T12:00:00+08:00
draft: false
tags: ["Git", "Workflow", "Unity", "DevOps", "Efficiency"]
---

# Git Worktree vs Clone: Parallel Development Strategies for Large Projects

## 1. The Problem

In the development of large-scale Unity projects (such as SLG mobile games), we often face the following scenarios:

1. **Parallel Tasks**: You are developing a new combat feature on `feature/combat`, but suddenly need to urgently fix an online crash on `hotfix/crash`.
2. **Code Review**: You just want to run a colleague's PR code for verification, but don't want to disrupt your current working directory.
3. **Library Nightmare**: The `Library` directory of a Unity project is usually huge (tens of GBs). Switching branches within the same repository causes Unity to reimport resources, which can take tens of minutes or even longer.

To solve this problem, developers usually look for a "multi-project directory" solution. There are two main options: `git clone` and `git worktree`.

---

## 2. Comparison

### 2.1 Traditional Approach: Multiple Git Clones

The most intuitive approach is to clone multiple copies of the repository on disk.

* **Structure**:
  * `/Project_Main/` (.git folder: 30GB)
  * `/Project_Hotfix/` (.git folder: 30GB)
  * `/Project_Review/` (.git folder: 30GB)
* **Pros**:
  * Complete physical isolation, no mutual influence.
* **Cons**:
  * **Disk Explosion**: Each copy has a complete `.git` history. For large projects with years of history, the `.git` directory can be up to tens of GBs. Three copies mean triple the usage.
  * **Tedious Syncing**: If you `git fetch` the latest remote code in the `Main` repo, the `Hotfix` repo doesn't know about it. You must enter each repo to `git fetch` individually.
  * **Redundant Hooks**: If git hooks are used, they need to be configured separately for each repository.

### 2.2 Recommended Approach: Git Worktree

`git worktree` is an official Git feature that allows a repository to link multiple Working Trees.

* **Structure**:
  * `/Project_Main/` (Main Repo, .git folder: 30GB)
    * `.git/` (contains objects, refs)
  * `/Project_Main_Hotfix/` (Worktree, .git file pointing to Main)
  * `/Project_Main_Review/` (Worktree, .git file pointing to Main)
* **Features**:
  * **Shared History**: All Worktrees share the same `.git` directory (Object Database). **Disk usage barely increases** (only the size of the currently checked-out source files).
  * **State Sync**: `git fetch origin` in the main repo makes the latest remote branches immediately visible to all Worktrees.
  * **Instant Creation**: Creating a new Worktree takes seconds (no network transfer involved, just checking out files).

---

## 3. Why is Git Worktree Better for Large Projects?

### 3.1 Disk Space Efficiency

For asset-heavy SLG projects, the `.git` directory is often huge.

* **Clone**: 50GB Repo * 3 Copies = **150GB**
* **Worktree**: 50GB Repo + (Checkouts) = **55GB** (approx.)
This saves nearly **66%** of space, which is critical for dev machines with limited SSD capacity.

### 3.2 Perfect Unity Library Isolation

This is a core pain point in Unity development.

* **Switching Branch (Single Repo)**: Modifying `Library` triggers Reimport, very slow.
* **Worktree**: Each Worktree is an independent folder, so it has an independent `Library` directory.
  * Folder A (Feature): `Library` corresponds to Feature branch resources.
  * Folder B (Hotfix): `Library` corresponds to Release branch resources.
  * **Switch Operation**: Just close Unity A and open Unity B. **Zero Wait**.

### 3.3 Branch Management Consistency

Git enforces that the same branch cannot be checked out by two Worktrees simultaneously. This avoids the conflict risk of modifying files in Directory A but committing to the same branch in Directory B. It forces logical clarity.

---

## 4. Best Practices

### 4.1 Recommended Directory Structure

A "Parallel Structure" is recommended over a "Nested Structure" to avoid `.gitignore` issues.

```text
/Users/domi/SoulMaster/          <-- Root
├── .git/                        <-- Actual .git dir (Held by Master)
├── FrostLegion_Master/          <-- Main Worktree (main branch)
├── FrostLegion_Hotfix/          <-- Aux Worktree (hotfix branch)
└── FrostLegion_Feature/         <-- Aux Worktree (feature/xxx branch)
```

### 4.2 Common Commands Cheat Sheet

```bash
# 1. Add a new Worktree in the main repo
# Syntax: git worktree add <path> <branch>
git worktree add ../FrostLegion_Hotfix hotfix/1.0.1

# 2. List all current Worktrees
git worktree list

# 3. Remove a Worktree (Run this to clean up refs after physically deleting folder)
git worktree prune
# Or remove gracefully
git worktree remove ../FrostLegion_Hotfix

# 4. Repair: If the Worktree was moved and became unusable
git worktree repair
```

### 4.3 Notes for Unity

* **Symbolic Link**: Advanced users can try symlinking common parts like `Library/PackageCache` to save even more space (but risky, suggest letting Unity regenerate libraries).
* **Tooling**: It helps to write a simple Shell/Python script (e.g., `add_worktree.sh`) to automatically run `git worktree add`, create `LocalConfig` 或拷贝基础配置，实现一键搭建环境。

---

## 5. Conclusion

Today, where "multi-branch parallel development" is the norm, **Git Worktree** is a more modern and efficient solution than Git Clone. It exchanges minimal disk cost for maximum **Environment Isolation** (Library isolation) and **State Synchronization**.

For SLG game projects tens of GBs in size, Git Worktree is practically a mandatory choice for improving developer happiness.
