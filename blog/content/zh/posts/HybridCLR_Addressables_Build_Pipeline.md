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
2. **Addressables Build**: Profile 选 `Default Local Group`, 构建到 `StreamingAssets`.
3. **Copy DLLs**: 将热更 DLL (Dlls/HotUpdate/*.dll) 和 AOT DLL 复制到 `StreamingAssets/Dlls`.
4. **Build Player**: 构建 EXE/APK，此时所有资源均在包内。

#### 2) LocalCDN (本地模拟热更)

**目标**: 验证 Addressables Catalog 更新和 DLL 下载逻辑。
**操作步骤**:

1. **HybridCLR Generate**.
2. **Addressables Build**: Profile 选 `Remote Profile` (Load Path 指向 `http://127.0.0.1:Port/`).
3. **Host Server**: 启动本地 HTTP Server (SimpleHttpServer 或 Addressables Hosting).
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

为解决热更中常见的资源代码不同步问题，我们采用严格的 **四轨版本号 + 统一策略** 方案。

### 3.1 版本职责与变更规则 (Rules & Responsibilities)

#### 1) appVersion (包体版本)

**定义**: 对应原生应用版本 (Major.Minor.Patch)。
**变更规则**: 只在 **包体内容变化** 时升级。

- AOT 代码/主工程代码 (non-hotfix) 改动
- 引擎升级、PlayerSettings 变更
- Addressables 初始化逻辑变更
- **不需要** 因为 hotfix DLL 或资源更新。

#### 2) dllVersion (逻辑版本)

**定义**: 热更代码版本 (整数或 Hash)。
**变更规则**: 只在 **HotUpdate DLL 改动** 时升级。

- HotUpdate 程序集 (Ebonor.*) 重新编译
- 逻辑 Bug 修复、数值公式调整
- **不需要** 因为资源变更。

#### 3) contentVersion (资源版本)

**定义**: Addressables 资源内容版本。
**变更规则**: 只在 **Addressables 内容变更** 时升级。

- Prefab/Texture/Audio 等资源的新增、修改、删除
- **不需要** 因为 DLL 变更。

#### 4) catalogVersion (索引版本)

**定义**: Addressables Build 产出的 Catalog 版本。
**变更规则**:

- 本质上是 contentVersion 的镜像。
- 如果 DLL 更新但资源没变，catalogVersion 可以不变。
- **推荐策略**: 让 `catalogVersion` ≈ `contentVersion`，保持同步以避免混淆。

### 3.2 依赖关系与依赖约束

为了保证版本兼容性，遵循以下约束：

1. **dllVersion 必须兼容 appVersion**
    - 热更 DLL 依赖 AOT 导出的 API。如果主工程有破坏性 API 修改，必须升级 `appVersion`，并废弃旧的 `dllVersion`。
2. **contentVersion 必须兼容 catalogVersion**
    - 这是 Addressables 的内部强绑定，建议两者保持一致。

### 3.3 版本更新触发规则表

| 变更内容 | appVersion | dllVersion | contentVersion | catalogVersion |
| :--- | :--- | :--- | :--- | :--- |
| **仅热更逻辑** (Hotfix Code) | 不变 | **+1** | 不变 | 不变 |
| **仅资源内容** (Assets) | 不变 | 不变 | **+1** | **+1** |
| **逻辑 + 资源** | 不变 | **+1** | **+1** | **+1** |
| **AOT/主工程改动** | **+1** | (重置或兼容) | (可选) | (可选) |

### 3.4 推荐：统一版本号策略 (Unified Strategy)

为了简化管理，建议在 Manifest 中只维护三个主要版本号：

- **appVersion**
- **hotfixVersion** (= dllVersion)
- **contentVersion** (= catalogVersion)

**更新示例**:
假设当前状态: `App: 1.2.0`, `Hotfix: 12`, `Content: 8`.

1. **场景: 只修了一个战斗公式 Bug** (仅 DLL 变)
    - App: `1.2.0`
    - Hotfix: `13` (+1)
    - Content: `8` (不变)

2. **场景: 只换了一张背景图** (仅资源变)
    - App: `1.2.0`
    - Hotfix: `13` (不变)
    - Content: `9` (+1)

### 3.5 启动流程与清单 (UpdateManifest)

客户端启动时下载 `UpdateManifest.json`：

```json
{
  "appVersion": "1.2.0",
  "minAppVersion": "1.0.0",
  "packages": {
    "windows": {
      "contentVersion": 9,
      "hotfixVersion": 13,
      "catalogUrl": "http://cdn/.../catalog_v9.json",
      "dlls": [
        {"name": "HotFix.dll", "md5": "...", "version": 13}
      ]
    }
  }
}
```

**更新检查逻辑**:

1. **App 检查**: 若 `Remote.minAppVersion > Local.appVersion` -> 强制去商店更新。
2. **Manifest 对比**:
    - 若 `Remote.hotfixVersion > Local.hotfixVersion` -> 下载 DLL。
    - 若 `Remote.contentVersion > Local.contentVersion` -> 更新 Addressables Catalog。
    - **原子性**: 只有当两者都（如有需要）下载/准备完毕后，才进入游戏，防止 代码v13 读取了不存在的 资源v9。

### 3.6 回滚策略 (Rollback)

- **服务端回滚**: 修改 `UpdateManifest` 指回旧的 `hotfixVersion` 或 `contentVersion`。
- **客户端处理**: 客户端感知到版本变化（即使变小），重新下载对应的 Catalog/DLL 并覆盖缓存。
- **灾难备份**: CDN 上始终保留历史版本目录（如 `/v8/`, `/v9/`），不要直接在原路径覆盖文件。

---

## 4. 下一步行动建议

1. **实施 Addressables 替换**: 修改 `BuildAssetsCommand.cs`，移除 `BuildPipeline`，接入 `AddressableAssetSettings.BuildPlayerContent()`.
2. **开发更新管理器 (UpdateManager)**: 实现上述的 Manifest 检查、下载、校验逻辑。
3. **搭建 CI/CD**: 将上述 Local/QA/Release 流程脚本化 (Jenkins/GitHub Actions).
