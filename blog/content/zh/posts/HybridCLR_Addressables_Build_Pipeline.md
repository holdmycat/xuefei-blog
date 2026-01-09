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
4. **Deploy**: Upload `ServerData` (含 Catalog, Bundles, DLLs) 到 QA CDN/S3/OSS。
5. **Build Player**: 此包只需打一次，后续通过热更测试。

#### 4) Release (正式发布)

**目标**: 稳定、安全、可追溯。
**操作步骤**:

1. **Version Freeze**: 锁定代码和资源版本。
2. **HybridCLR Generate** & **Compile DLL**.
3. **Addressables Build**: Load Path 指向 Production CDN。
4. **MD5 & Hash**: 生成所有文件的校验清单 (Manifest)。
5. **Distribute**: Upload to CDN, refresh CDN cache.
6. **Backend Config**: 后台配置最新版本号，控制灰度或全量推送。

---

## 3. 版本控制与回滚策略 (Version Control & Rollback)

我们采用严格的 **四轨版本号** 结合 **服务端 Manifest 控制** 的策略。

### 3.1 版本定义与执行规则

#### 1) UpdateManifest.json 模板

客户端启动时，优先请求远端的版本清单。结构如下：

```json
{
  "appVersion": "1.2.0",
  "dllVersion": 13,
  "contentVersion": 9,
  "catalogVersion": 9,
  "minSupportedAppVersion": "1.2.0",
  "forceRollback": false,
  "rollbackTarget": {
    "dllVersion": 12,
    "contentVersion": 8,
    "catalogVersion": 8
  },
  "download": {
    "baseUrl": "https://cdn.example.com/game",
    "env": "OnlineTest",
    "channel": "android"
  },
  "buildTime": "2025-02-10T12:00:00Z",
  "notes": "fix combat logic + update tower assets"
}
```

#### 2) 版本变更规则

| 版本号 | 变更时机 | 依赖关系 |
| :--- | :--- | :--- |
| **appVersion** | 包体内容(AOT/Setting/Unity)变化 | 必须 >= `minSupportedAppVersion`，否则阻断热更强制换包 |
| **contentVersion** | Addressables资源变化 | 任何资源变动则 contentVersion +1，**强绑定** catalogVersion |
| **catalogVersion** | Addressables Build产物 | 建议始终与 contentVersion **相同**，避免混乱 |
| **dllVersion** | 热更DLL逻辑变化 | 只要DLL变动则 +1，**不必** 随 contentVersion 变化 |

### 3.2 客户端校验执行流程

1. **Fetch Manifest**: 客户端拉取远端 `UpdateManifest.json`。
2. **App Version Check**:
    - 检查 `Local.appVersion >= Remote.minSupportedAppVersion`。
    - **不满足** → 弹出强制更新 URL，禁止进入游戏。
3. **Force Rollback Check**:
    - 若 `forceRollback == true` → 立即忽略当前版本信息，使用 `rollbackTarget` 字段中的版本配置。
    - 逻辑上等同于将远端版本“降级”处理。
4. **Version Comparison & Download**:
    - **DLL**: 若 `Target.dllVersion > Local.dllVersion` → 下载 HotUpdate DLL。
    - **Content**: 若 `Target.contentVersion > Local.contentVersion` → Addressables Update Catalog & Download Assets。
5. **Cache & Launch**:
    - 下载完成并校验（MD5/Hash）通过后，将版本信息写入本地缓存（`PlayerPrefs` 或 本地 Manifest）。
    - 进入游戏（可能需要 Reload Domain）。

### 3.3 回滚策略 (Rollback Strategy)

#### 1) 客户端自动回滚 (Fallback)

客户端应维护一个 `"LastGoodVersion"` (上一次成功启动并运行的版本)。
- **触发**: 如果热更后启动失败（Crash 或 逻辑卡死超时）。
- **动作**: 自动回退到 `LastGoodVersion` 或 包内自带的 `StreamingAssets` 初始版本。

#### 2) 服务端强制回滚 (Force Rollback)

* **触发**: 线上发现严重 Bug（如数值错误、逻辑崩溃）。
- **动作**: 运维/策划修改 `UpdateManifest.json`，将 `forceRollback` 置为 `true` 并填充 `rollbackTarget`。
- **效果**: 所有客户端下次启动时，强制回退到指定的老版本（例如 v12/v8），禁止下载新资源。

---

## 4. CI/CD 自动化构建流程 (CI/CD Optimization)

为了减少人工错误并提高发布效率，建议引入 Jenkins/GitLab CI 进行自动化构建。

### 4.1 Jenkins 与 Unity Editor 的职责划分

* **Jenkins (CI 服务器)**: 负责所有正式的打包、热更构建和发布流程。完全脚本化，无需人工干预 UI。
- **Unity Editor (本地工作台)**: 保留菜单栏打包入口，仅用于开发者的**本地调试**和**功能验证**。

### 4.2 CI 构建顺序 (Recommended Pipeline)

这是一个严格的串行流程，确保版本的一致性。

#### **阶段 A: 代码准备 (A. Preparation)**

* **触发**: Git Merge / Tag Push
- **动作**:
  - 拉取最新 HotUpdate 脚本代码。
  - 确保 Addressables 资源文件已就位。

#### **阶段 B: CI 构建 (B. Build)**

1. **Build HotUpdate DLL**: 编译热更 DLL，生成最新的 `Assembly-CSharp.dll` 等。
2. **Build Addressables**: 执行 Addressables Build (全量 New Build 或 增量 Update Previous Build)。
3. **Generate UpdateManifest**: 基于上述两步的产物 (DLL Hash + Catalog Hash)，自动生成 `UpdateManifest.json` 文件。

#### **阶段 C: 发布 (C. Release)**

4. **Upload Assets**: 将 DLL、Addressables Bundles (`.bundle`)、Catalog (`.json`, `.hash`) 上传到 CDN。
2. **Upload Manifest (Final Step)**: **最后上传** `UpdateManifest.json`。
    - **原理**: Manifest 是热更的“开关”。只有当所有资源都上传就绪后，才更新 Manifest，防止客户端下载到不存在的文件 (404)。

#### **阶段 D: 验证 (D. Verify)**

* **顺序**: `LocalCDN` -> `OnlineTest` -> `Release`
- 逐级验证，确保无误后再推向外网。

---

## 5. 相关配置表 (Summary & Rules)

### 5.1 版本更新触发规则表

| 变更内容 | appVersion | dllVersion | contentVersion | catalogVersion | behavior |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **仅热更逻辑** | 不变 | **+1** | 不变 | 不变 | 只下载 DLL |
| **仅资源内容** | 不变 | 不变 | **+1** | **+1** | 只更新 Catalog & Asset |
| **逻辑 + 资源** | 不变 | **+1** | **+1** | **+1** | 同时下载 |
| **AOT/主工程改动** | **+1** | N/A | N/A | N/A | 强制整包更新 |

### 5.2 推荐统一策略

为了简化心智负担，建议：
- **CatalogVersion == ContentVersion** (始终同步)
- **DllVersion** 独立自增
- **AppVersion** 语义化管理

---

## 6. 下一步行动建议

1. **实施 Addressables 替换**: 修改 `BuildAssetsCommand.cs`，移除 `BuildPipeline`，接入 `AddressableAssetSettings.BuildPlayerContent()`.
2. **开发更新管理器 (UpdateManager)**: 实现上述的 Manifest 模板解析、ForceRollback 逻辑、LastGood 回退逻辑。
3. **编写 CI 脚本**: 将 "4.2 CI 构建顺序" 转化为 Shell/Python 脚本，供 Jenkins 调用。
