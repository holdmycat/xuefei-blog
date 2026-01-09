---
title: "HybridCLR + Addressables 构建与热更发布方案 (Build & Release Pipeline)"
date: 2026-01-09T14:30:00+08:00
draft: false
tags: ["Build Pipeline", "HybridCLR", "Addressables", "Unity", "Hotfix"]
---

# HybridCLR + Addressables 构建与热更发布方案

## 1. 现有工具分析 (Existing Tools Analysis)

当前 `Scripts/Editor/HybridCLREditor/` 下的脚本主要实现了基于 AssetBundle 和 HybridCLR 的基础打包流程。

### 1.1 脚本功能详解

- **BuildPlayerCommand.cs**
  - **功能**: 一键构建 Win64 播放器。
  - **流程**:
    1. 检查平台是否为 Windows。
    2. 调用 `PrebuildCommand.GenerateAll()` 生成 HybridCLR 桥接函数和 AOT 元数据。
    3. 调用 `BuildPipeline.BuildPlayer` 构建原生 EXE。
    4. **关键点**: 构建完成后，手动触发 `BuildAssetsCommand` 打包资源并复制到 `StreamingAssets`。这确保了包内包含初始资源。

- **BuildAssetsCommand.cs**
  - **功能**: 管理热更资源 (Hotfix DLLs) 和资产 (AssetBundles)。
  - **现状**:
    - `BuildAssetBundles`: 使用旧版 `BuildPipeline` API 打包 Prefabs。**此部分需要替换为 Addressables。**
    - `CompileDll`: 编译热更 DLL。
    - `CopyABAOTHotUpdateDlls`: 将 AOT 元数据 DLL、热更 DLL 和 AB 包复制到 `StreamingAssets`。
  - **改进方向**: 需要移除 AssetBundle 相关代码，接入 `AddressableAssetSettings.BuildPlayerContent()`。

- **HybridCLRFixTool.cs**
  - **功能**: macOS 环境下的环境修复工具。
  - **逻辑**: 检测并修复 `libil2cpp` 的符号链接，确保 Unity Editor 使用 HybridCLR 修改后的 il2cpp 运行时，并执行 `install.py`。这是 mac 开发必备的环境配置工具。

- **GraphAssetPlaymodeGuard.cs**
  - **功能**: 编辑器防污染保护。
  - **逻辑**: 在进入 PlayMode 时快照图数据 (Graph Assets)，退出时还原。防止运行时的动态修改保存到 `.asset` 文件中。

---

## 2. 构建与发布方案 (Build & Release Scheme)

结合 Addressables 和 HybridCLR，我们将环境划分为四级，满足开发、测试、正式上线的不同需求。

### 2.1 环境定义与命名

| 环境名称 | 别名 | 用途 | 资源加载方式 | 特征 |
| :--- | :--- | :--- | :--- | :--- |
| **LocalDev** | Development | 快速迭代、功能开发 | **Local** (Editor/StreamingAssets) | 不走 CDN，每次构建覆盖本地文件，DLL 直接复制 |
| **LocalCDN** | LocalTest | 验证更新链路 | **Remote** (Loopback HTTP) | 本地搭建 HTTP 服务模拟 CDN，测试下载/哈希校验 |
| **OnlineTest** | QA/Staging | 团队测试、QA 验收 | **Remote** (QA CDN) | 部署到内网/公网测试服，固定版本号，模拟真实网络 |
| **Release** | Production | 正式上线 | **Remote** (Prod CDN) | 严格版本控制，版本冻结，支持回滚 |

### 2.2 详细构建流程

#### 1) LocalDev (本地全量构建)

**目标**: 打出一个可以直接运行的包，无需联网。
**操作步骤**:

1. **HybridCLR Generate**: 生成 AOT/Bridge 代码。
2. **Addressables Build**: Profile 选 `Default Local Group`，构建到 `StreamingAssets`。
3. **Copy DLLs**: 将热更 DLL (Dlls/HotUpdate/*.dll) 和 AOT DLL 复制到 `StreamingAssets/Dlls`。
4. **Build Player**: 构建 EXE/APK，此时所有资源均在包内。

#### 2) LocalCDN (本地模拟热更)

**目标**: 验证 Addressables Catalog 更新和 DLL 下载逻辑。
**操作步骤**:

1. **HybridCLR Generate**.
2. **Addressables Build**: Profile 选 `Remote Profile` (Load Path 指向 `http://127.0.0.1:Port/`).
3. **Host Server**: 启动本地 HTTP Server (SimpleHttpServer 或 Addressables Hosting)。
4. **Deploy DLLs**: 将 DLLs 复制到 HTTP Server 的对应目录 (如 `ServerData/Windows/v1.0.0/Dlls`).
5. **App Run**: 运行 App，App 读取远端 Catalog，下载更新的资源和 DLL。

#### 3) OnlineTest (QA 环境)

**目标**: QA 介入，模拟真实网络环境。
**操作步骤**:

1. **Set Version**: 设置 `AppVersion` (如 0.1.0)。
2. **HybridCLR Generate**.
3. **Addressables Build**: Load Path 指向 QA CDN (`https://qa-cdn.game.com/...`).
4. **Deploy**: 上传 `ServerData` (含 Catalog, Bundles, DLLs) 到 QA CDN/S3/OSS。
5. **Build Player**: 此包只需打一次，后续通过热更测试。

#### 4) Release (正式发布)

**目标**: 稳定、安全、可追溯。
**操作步骤**:

1. **Version Freeze**: 锁定代码和资源版本。
2. **HybridCLR Generate** & **Compile DLL**.
3. **Addressables Build**: Load Path 指向 Production CDN。
4. **MD5 & Hash**: 生成所有文件的校验清单 (Manifest)。
5. **Distribute**: 上传 CDN，刷新 CDN 缓存。
6. **Backend Config**: 后台配置最新版本号，控制灰度或全量推送。

---

## 3. 版本控制与回滚策略 (Version Control & Rollback)

为解决热更中常见的资源代码不同步问题，建议采用 **App、资源、代码三轨版本号** 策略。

### 3.1 版本结构结构

建议在 `StreamingAssets` 和远端 CDN 根目录下维护一个 `UpdateManifest.json`。

| 字段 | 说明 | 示例 |
| :--- | :--- | :--- |
| `appVersion` | 原生包版本 (Major.Minor.Patch) | `1.0.0` |
| `resVersion` | Addressables 资源版本 (Catalog Hash 或时间戳) | `20240109_1530` |
| `dllVersion` | 代码版本 (Hash 或编译计数) | `v15` |
| `minAppVersion` | 强制整包更新的最低 App 版本 | `0.9.5` |

**Manifest 示例**:

```json
{
  "appVersion": "1.0.0",
  "minAppVersion": "1.0.0",
  "packages": {
    "windows": {
      "resVersion": "20240109_01",
      "dllVersion": "20240109_01",
      "catalogHash": "a1b2c3d4...",
      "dlls": [
        {"name": "HotFix.dll", "hash": "...", "url": "..."}
      ]
    }
  }
}
```

### 3.2 启动与检查流程

1. **Check Manifest**: App 启动，请求远端 `UpdateManifest.json`。
2. **App Version Check**:
   - `Remote.minAppVersion > Local.appVersion`: **强制更新 App** (跳转商店)。
   - `Remote.appVersion == Local.appVersion`: 继续热更检查。
3. **Resource/DLL Update**:
   - 对比 `Local.resVersion` vs `Remote.resVersion`。
   - 对比 `Local.dllVersion` vs `Remote.dllVersion`。
   - **重要**: 必须确保 DLL 和 资源是**原子性更新**。即：如果 DLL 更新了，必须确保对应版本的资源也就位，否则可能出现代码访问不存在的资源。
4. **Download**:
   - `Addressables.UpdateCatalogs()`
   - 下载新 DLL 到持久化目录 (`Application.persistentDataPath/Dlls`)。
5. **Reload/Enter Game**: 下载完成后，如果是 DLL 更新，通常需要重启 App 或（在 HybridCLR 中）重新加载域。

### 3.3 回滚策略 (Rollback Strategy)

**场景**: 发布了 v1.0.1，发现严重 Crash。

**方案**:

1. **服务端回滚**: 修改远端 `UpdateManifest.json`，将 `resVersion` 和 `dllVersion` 指回 v1.0.0 的配置。
2. **客户端处理**:
   - 客户端检测到远端版本变更（即使是“降级”）。
   - 重新下载 v1.0.0 的 Catalog 和 DLL。
   - 覆盖本地缓存。
3. **灾难恢复 (Force Fallback)**:
   - 在 CD 流程中保留最近 3 个版本的完整文件 (Archive)。
   - 如果 CDN 文件损坏，运维只需将 `Backup/v1.0.0` 覆盖回 `Release/Current`。

### 3.4 常见问题解决方案 (FAQ)

| 问题 | 解决方案 |
| :--- | :--- |
| **Q1: 热更 DLL 与 AOT 元数据不匹配** | **强绑定版本**: 打包 App 时生成的 AOT DLL 必须归档。每次热更 DLL 时，编译环境必须使用**完全一致**的 AOT DLL (即 commit hash 要对齐)。建议 CI/CD 中记录构建时的 commit id。 |
| **Q2: Addressables Catalog 与资源不一致** | **Catalog 放在版本目录**: 不要覆盖根目录的 `catalog.json`，而是使用 `/v1.0.1/catalog.json`。`UpdateManifest` 指向具体的 catalog url。 |
| **Q3: 缓存脏数据 (Dirty Cache)** | **Hash 校验**: 每次下载必须校验 MD5。若校验失败，删除该文件并重试。可以在 Debug 面板提供 "Clear Cache" 按钮。 |
| **Q4: 热更过程中断网** | **断点续传 & 临时目录**: 文件下载到 `.temp`，全部下载 + 校验完毕后，再一次性 Move 到正式目录。避免只更新了一半的文件被加载。 |
| **Q5: 更新后崩溃无法启动** | **安全模式 (Safe Mode)**: 记录 `LastSuccessVersion`。如果启动后连续 Crash 3 次，自动清理热更缓存，回滚到包内 `StreamingAssets` 的原始版本，并上报错误。 |

## 4. 下一步行动建议

1. **实施 Addressables 替换**: 修改 `BuildAssetsCommand.cs`，移除 `BuildPipeline`，接入 `AddressableAssetSettings.BuildPlayerContent()`。
2. **开发更新管理器 (UpdateManager)**: 实现上述的 Manifest 检查、下载、校验逻辑。
3. **搭建 CI/CD**: 将上述 Local/QA/Release 流程脚本化 (Jenkins/GitHub Actions)。
