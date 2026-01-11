---
title: "SLG Mobile Game Repository & Branching Strategy"
date: 2026-01-11T10:00:00+08:00
draft: false
tags: ["Build Pipeline", "Git", "Branching Strategy", "DevOps", "SLG"]
---

# SLG Mobile Game Repository & Branching Strategy

## 1. Repository Structure Design

To facilitate small team collaboration and unified resource management, a **Monorepo** structure is recommended.

### 1.1 Directory Structure

- **FrostLegion_Master/** (Unity Client Project)
  - `Assets/`: Game Assets
  - `Packages/`: Package Management
  - `ProjectSettings/`: Project Settings
  - **Team Config**: `AddressableUpdateConfig.asset` (Shared build configuration)
  - **Local Config**: `AddressableUpdateLocalConfig.asset` (Personal local configuration, **ignored by .gitignore**)
  - `Docs/`: Project Documentation & Standards
- **cdn_server/** (Dockerized CDN Service)
  - `Local/`: Resource directory for Local Development
  - `OnlineTest/`: Resource directory for QA/Staging
  - `Release/`: Resource directory for Production
  - `docker-compose.yml`: CDN Service Configuration

> **Alternative**: As the team grows, `client` and `cdn_server` can be split into two independent repositories, but for the current stage, a Monorepo is better for maintaining version consistency.

---

## 2. Branching Model & Environment Mapping

We adopt an improved GitFlow model, strictly defining the mapping between branches and deployment environments.

### 2.1 Core Branch Rules

| Branch Name | Purpose | Allowed Environment | Permissions |
| :--- | :--- | :--- | :--- |
| **main / master** | **Integration Branch**, code ready for release at any time | **LocalCDN** (Personal Test) | Merge Request Only, **Direct Push Prohibited** |
| **dev / feature/*** | **Development Branch**, daily feature development | **LocalCDN** (Personal Test) | Developers Read/Write |
| **release/x.y.z** | **QA Branch**, feature freeze, used for testing | **OnlineTest** (QA Environment) | Tech Lead / Build Master Create |
| **hotfix/x.y.z** | **Hotfix Branch**, urgent online fixes | **Release** (Production) | Tech Lead Create, Merge back to main & release after fix |
| **sdk/*** | **SDK Branch**, integrating channel SDKs | **LocalCDN** (Independent Dir) | Used for debugging specific channel packages |

---

## 3. Workflow Explained

### 3.1 Daily Development

1. **Branch**: Pull `feature/debug-combat` from `main`.
2. **Build**: Developer triggers local build, pushing resources to `cdn_server/Local/`.
3. **Verify**: Connect phone/simulator to local WiFi, test hotfix and game flow.
4. **Merge**: After self-testing, submit a Pull Request to `main`.

### 3.2 QA Testing

1. **Submit**: Feature development complete, create branch `release/1.0.0` from `main`.
2. **Build**: CI/CD auto-build, pushing resources to `OnlineTest` CDN environment.
3. **Verify**: QA team downloads test package, connects to OnlineTest environment for acceptance.
4. **Fix**: Bugs are fixed directly on this branch, rebuilt, and pushed to OnlineTest.

### 3.3 Production Release

1. **Finalize**: QA acceptance passed.
2. **Build**: Execute Release build on `release/1.0.0` branch, pushing to `Release` CDN environment.
3. **Tag**: Tag the commit as `v1.0.0`.
4. **Merge**: Merge `release/1.0.0` back to `main` and delete the branch.

### 3.4 Gray Release (Optional)

1. **Directory**: Create subdirectory `Release/gray/` under Release environment.
2. **Build**: Build `UpdateManifest` with special config, push to gray directory.
3. **Control**: Backend issues different `UpdateManifest` URLs based on UserID or config, guiding selected users to update via the gray directory.

### 3.5 Rollback

1. **Plan A (Manifest Rollback)**: Modify the pointer in `latest.json` or `UpdateManifest.json` to point to the previous hash/URL. Client restart takes effect immediately.
2. **Plan B (Package Rollback)**: Re-package resources from the previous stable Tag (`v0.9.9`) and overwrite push.

### 3.6 Online Hotfix

1. **Branch**: Create `hotfix/1.0.1` from Tag `v1.0.0`.
2. **Modify**: Only modify Lua/C# hotfix scripts or assets.
3. **Build**: Build Patch package, push to `Release` environment.
4. **Version**: Increment `hotfixVersion` or `dllVersion`.
5. **Merge**: After verification, merge back to `main` and Tag `v1.0.1`.

---

## 4. Best Practices & Missing Ops

### 4.1 Permissions & Security

* **CODEOWNERS**: Set code owners for critical configs like `AddressableUpdateConfig.asset`, enforcing Code Review.
- **Branch Protection**: Lock `main` and `release/*` branches to prevent accidental operations.

### 4.2 Version & Artifacts

* **Version Locking**: Strictly lock `AppVersion` in `release` and `hotfix` branches to prevent base package drift.
- **Artifact Archiving**: CI builds must archive Build Logs, Symbols (dSYM/PDB), and corresponding Git Commit Hashes for crash stack restoration.

### 4.3 Multi-Platform & Channel Isolation

* **Platform Isolation**: Strictly distinguish `Android/` and `iOS/` directories under the same version.
- **Channel Isolation**: If integrating different channel SDKs, use branches like `sdk/xiaomi` and create independent subdirectories `channel_xiaomi/` on CDN to avoid resource mixing.

### 4.4 Configuration Management

* **Profile Initialization**: Ensure Addressables Profiles for each environment (Local/Online/Release) are fixed. Switch Profile IDs instead of modifying content dynamically during build.
- **Switch Control**: Switches for Gray Release, Maintenance, Forced Update, etc., should be integrated in `latest.json` or a separate `server_config.json`, controlled by backend API rather than hardcoded in the client.
