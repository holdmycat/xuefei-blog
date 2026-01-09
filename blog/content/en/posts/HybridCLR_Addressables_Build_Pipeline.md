---
title: "HybridCLR + Addressables Build & Release Pipeline"
date: 2026-01-09T14:30:00+08:00
draft: false
tags: ["Build Pipeline", "HybridCLR", "Addressables", "Unity", "Hotfix"]
---

# HybridCLR + Addressables Build & Release Pipeline

## 1. Existing Tools Analysis

The current scripts under `Scripts/Editor/HybridCLREditor/` primarily implement a basic build process based on AssetBundles and HybridCLR.

### 1.1 Script Functions Breakdown

- **BuildPlayerCommand.cs**
  - **Function**: One-click build for Windows 64-bit Player.
  - **Process**:
    1. Checks if the platform is Windows.
    2. Calls `PrebuildCommand.GenerateAll()` to generate HybridCLR bridge functions and AOT metadata.
    3. Calls `BuildPipeline.BuildPlayer` to build the native EXE.
    4. **Key Point**: After building, it manually triggers `BuildAssetsCommand` to pack resources and copy them to `StreamingAssets`. This ensures the package contains initial resources.

- **BuildAssetsCommand.cs**
  - **Function**: Manages hot update resources (Hotfix DLLs) and assets (AssetBundles).
  - **Current Status**:
    - `BuildAssetBundles`: Uses the legacy `BuildPipeline` API to pack Prefabs. **This part needs to be replaced with Addressables.**
    - `CompileDll`: Compiles hot update DLLs.
    - `CopyABAOTHotUpdateDlls`: Copies AOT metadata DLLs, hot update DLLs, and AB packages to `StreamingAssets`.
  - **Improvement Direction**: Need to remove AssetBundle related code and integrate `AddressableAssetSettings.BuildPlayerContent()`.

- **HybridCLRFixTool.cs**
  - **Function**: Environment repair tool for macOS.
  - **Logic**: Detects and repairs symbolic links for `libil2cpp`, ensuring Unity Editor uses the HybridCLR modified il2cpp runtime, and executes `install.py`. This is essential environment configuration for Mac development.

- **GraphAssetPlaymodeGuard.cs**
  - **Function**: Editor anti-corruption guard.
  - **Logic**: Snapshots graph data (Graph Assets) when entering PlayMode and restores it upon exit. Prevents runtime dynamic modifications from being saved to `.asset` files.

---

## 2. Build & Release Scheme

Combining Addressables and HybridCLR, we divide the environment into four levels to meet the different needs of development, testing, and official release.

### 2.1 Environment Definitions & Naming

| Environment Name | Alias | Purpose | Resource Loading | Characteristics |
| :--- | :--- | :--- | :--- | :--- |
| **LocalDev** | Development | Rapid iteration, feature development | **Local** (Editor/StreamingAssets) | No CDN, overwrite local files every build, DLLs copied directly |
| **LocalCDN** | LocalTest | Verify update chain | **Remote** (Loopback HTTP) | Local HTTP Server simulating CDN, test download/hash verification |
| **OnlineTest** | QA/Staging | Team testing, QA acceptance | **Remote** (QA CDN) | Deploy to intranet/public test server, fixed version, simulate real network |
| **Release** | Production | Official Launch | **Remote** (Prod CDN) | Strict version control, frozen version, rollback support |

### 2.2 Detailed Build Process

#### 1) LocalDev (Local Full Build)

**Goal**: Build a pack that can run directly without internet.
**Steps**:

1. **HybridCLR Generate**: Generate AOT/Bridge code.
2. **Addressables Build**: Select Profile `Default Local Group`, build to `StreamingAssets`.
3. **Copy DLLs**: Copy hot update DLLs (Dlls/HotUpdate/*.dll) and AOT DLLs to `StreamingAssets/Dlls`.
4. **Build Player**: Build EXE/APK, at this point all resources are inside the package.

#### 2) LocalCDN (Local Simulated Hotfix)

**Goal**: Verify Addressables Catalog update and DLL download logic.
**Steps**:

1. **HybridCLR Generate**.
2. **Addressables Build**: Select Profile `Remote Profile` (Load Path points to `http://127.0.0.1:Port/`).
3. **Host Server**: Start local HTTP Server (SimpleHttpServer or Addressables Hosting).
4. **Deploy DLLs**: Copy DLLs to the HTTP Server's corresponding directory (e.g., `ServerData/Windows/v1.0.0/Dlls`).
5. **App Run**: Run App, App reads remote Catalog, downloads updated resources and DLLs.

#### 3) OnlineTest (QA Environment)

**Goal**: QA intervention, simulating real network environment.
**Steps**:

1. **Set Version**: Set `AppVersion` (e.g., 0.1.0).
2. **HybridCLR Generate**.
3. **Addressables Build**: Load Path points to QA CDN (`https://qa-cdn.game.com/...`).
4. **Deploy**: Upload `ServerData` (containing Catalog, Bundles, DLLs) to QA CDN/S3/OSS.
5. **Build Player**: This package only needs to be built once, subsequent testing via hotfix.

#### 4) Release (Official Release)

**Goal**: Stable, secure, traceable.
**Steps**:

1. **Version Freeze**: Lock code and resource versions.
2. **HybridCLR Generate** & **Compile DLL**.
3. **Addressables Build**: Load Path points to Production CDN.
4. **MD5 & Hash**: Generate checksum manifest for all files.
5. **Distribute**: Upload to CDN, refresh CDN cache.
6. **Backend Config**: Backend configures the latest version number, controls gray box or full push.

---

## 3. Version Control & Rollback Strategy

We adopt a strict **Four-Track Versioning** strategy combined with **Server-Side Manifest Control**.

### 3.1 Version Definition & Execution Rules

#### 1) UpdateManifest.json Template

The client requests the remote version manifest upon startup. The structure is as follows:

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

#### 2) Version Change Rules

| Version | Trigger | Dependencies |
| :--- | :--- | :--- |
| **appVersion** | Package Content Change (AOT/Settings/Unity) | Must be >= `minSupportedAppVersion`, otherwise block hotfix and force full update |
| **contentVersion** | Addressables Asset Change | Any asset change increments contentVersion + 1, **Strong Binding** with catalogVersion |
| **catalogVersion** | Addressables Build Output | Recommended to always be **SAME** as contentVersion to avoid confusion |
| **dllVersion** | Hotfix DLL Logic Change | Increment +1 on any DLL change, **Independent** of contentVersion |

### 3.2 Client Verification Flow

1. **Fetch Manifest**: Client fetches remote `UpdateManifest.json`.
2. **App Version Check**:
    - Check `Local.appVersion >= Remote.minSupportedAppVersion`.
    - **Failed** → Prompt forced update URL, block game entry.
3. **Force Rollback Check**:
    - If `forceRollback == true` → Immediately ignore current version info, use version config from `rollbackTarget`.
    - Logically equivalent to "downgrading" the remote version.
4. **Version Comparison & Download**:
    - **DLL**: If `Target.dllVersion > Local.dllVersion` → Download HotUpdate DLL.
    - **Content**: If `Target.contentVersion > Local.contentVersion` → Addressables Update Catalog & Download Assets.
5. **Cache & Launch**:
    - After download and verification (MD5/Hash), write version info to local cache (`PlayerPrefs` or Local Manifest).
    - Enter game (may require Domain Reload).

### 3.3 Rollback Strategy

#### 1) Client Auto-Fallback

The client should maintain a `"LastGoodVersion"` (the last version that successfully started and ran).
- **Trigger**: If startup fails after hotfix (Crash or Logic Timeout).
- **Action**: Automatically fallback to `LastGoodVersion` or the initial version in `StreamingAssets`.

#### 2) Server Force Rollback

* **Trigger**: Severe Bug found online (e.g., numerical error, logic crash).
- **Action**: Ops/Designers modify `UpdateManifest.json`, set `forceRollback` to `true`, and fill in `rollbackTarget`.
- **Effect**: All clients will forcibly rollback to the specified old version (e.g., v12/v8) on next startup, and strictly forbid downloading new resources.

---

## 4. CI/CD Automated Build Pipeline

To reduce human error and improve release efficiency, it is recommended to introduce Jenkins/GitLab CI for automated builds.

### 4.1 Roles of Jenkins and Unity Editor

* **Jenkins (CI Server)**: Responsible for all official packaging, hotfix building, and release processes. Fully scripted, no manual UI intervention.
- **Unity Editor (Local Workbench)**: Retain menu bar build entries only for developer's **local debugging** and **feature verification**.

### 4.2 CI Build Order (Recommended Pipeline)

This is a strict serial process to ensure version consistency.

#### **Phase A: Preparation**

* **Trigger**: Git Merge / Tag Push
- **Action**:
  - Pull latest HotUpdate script code.
  - Ensure Addressables asset files are in place.

#### **Phase B: CI Build**

1. **Build HotUpdate DLL**: Compile hot update DLLs, generating the latest `Assembly-CSharp.dll` etc.
2. **Build Addressables**: Execute Addressables Build (Full New Build or Incremental Update Previous Build).
3. **Generate UpdateManifest**: Automatically generate `UpdateManifest.json` file based on the artifacts from the above two steps (DLL Hash + Catalog Hash).

#### **Phase C: Release**

4. **Upload Assets**: Upload DLLs, Addressables Bundles (`.bundle`), and Catalog (`.json`, `.hash`) to CDN.
2. **Upload Manifest (Final Step)**: **Upload** `UpdateManifest.json` **LAST**.
    - **Principle**: The Manifest is the "switch" for hotfixes. Only when all resources are uploaded and ready can the Manifest be updated to prevent clients from downloading non-existent files (404).

#### **Phase D: Verify**

* **Sequence**: `LocalCDN` -> `OnlineTest` -> `Release`
- Verify level by level, ensuring correctness before pushing to the public internet.

---

## 5. Configuration Summary & Rules

### 5.1 Version Update Trigger Table

| Change Content | appVersion | dllVersion | contentVersion | catalogVersion | behavior |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Hotfix Code Only** | Unchanged | **+1** | Unchanged | Unchanged | Download DLL only |
| **Assets Only** | Unchanged | Unchanged | **+1** | **+1** | Update Catalog & Assets only |
| **Code + Assets** | Unchanged | **+1** | **+1** | **+1** | Download Both |
| **AOT / Main Project** | **+1** | N/A | N/A | N/A | Force Full Package Update |

### 5.2 Recommended Unified Strategy

To reduce cognitive load, we recommend:
- **CatalogVersion == ContentVersion** (Always Sync)
- **DllVersion** Independent Increment
- **AppVersion** Semantic Management

---

## 6. Next Steps

1. **Implement Addressables Replacement**: Modify `BuildAssetsCommand.cs`, remove `BuildPipeline`, integrate `AddressableAssetSettings.BuildPlayerContent()`.
2. **Develop Update Manager**: Implement the Manifest parsing, ForceRollback, and LastGood fallback logic.
3. **Write CI Scripts**: Convert "4.2 CI Build Order" into Shell/Python scripts for Jenkins to invoke.
