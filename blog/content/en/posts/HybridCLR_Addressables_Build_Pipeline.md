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

To address the common synchronization issues between resources and code in hot updates, we adopt a strict **Four-Track Versioning + Unified Strategy**.

### 3.1 Responsibilities & Rules

#### 1) appVersion (Package Version)

**Definition**: Corresponds to the native application version (Major.Minor.Patch).
**Update Rule**: Updates ONLY when **Package Content Changes**.

- AOT code / Main project code (non-hotfix) changes.
- Engine upgrade, PlayerSettings changes.
- Addressables initialization logic changes.
- **Does NOT** update for hotfix DLL or resource updates.

#### 2) dllVersion (Logic Version)

**Definition**: Hot update code version (Integer or Hash).
**Update Rule**: Updates ONLY when **HotUpdate DLL Changes**.

- Recompilation of HotUpdate assemblies (Ebonor.*).
- Logic bug fixes, numerical formula adjustments.
- **Does NOT** update for resource changes.

#### 3) contentVersion (Resource Version)

**Definition**: Addressables resource content version.
**Update Rule**: Updates ONLY when **Addressables Content Changes**.

- Addition, modification, or removal of Prefabs/Textures/Audio.
- **Does NOT** update for DLL changes.

#### 4) catalogVersion (Index Version)

**Definition**: The Catalog version produced by Addressables Build.
**Update Rule**:

- Essentially a mirror of `contentVersion`.
- If DLL updates but resources don't, `catalogVersion` can remain unchanged.
- **Recommended Strategy**: Keep `catalogVersion` ≈ `contentVersion` to avoid confusion.

### 3.2 Dependencies & Constraints

To ensure version compatibility, adhere to the following constraints:

1. **dllVersion MUST be compatible with appVersion**
    - Hot update DLLs depend on APIs exported by AOT. If there are breaking API changes in the main project, `appVersion` MUST be upgraded, and old `dllVersion` deprecated.
2. **contentVersion MUST be compatible with catalogVersion**
    - This is a strong internal binding of Addressables. It is recommended to keep them consistent.

### 3.3 Version Update Trigger Table

| Change Content | appVersion | dllVersion | contentVersion | catalogVersion |
| :--- | :--- | :--- | :--- | :--- |
| **Hotfix Code Only** | Unchanged | **+1** | Unchanged | Unchanged |
| **Assets Only** | Unchanged | Unchanged | **+1** | **+1** |
| **Code + Assets** | Unchanged | **+1** | **+1** | **+1** |
| **AOT / Main Project** | **+1** | (Reset/Compat) | (Optional) | (Optional) |

### 3.4 Recommended: Unified Versioning Strategy

To simplify management, it is recommended to maintain only three main versions in the Manifest:

- **appVersion**
- **hotfixVersion** (= dllVersion)
- **contentVersion** (= catalogVersion)

**Update Example**:
Assume current state: `App: 1.2.0`, `Hotfix: 12`, `Content: 8`.

1. **Scenario: Fixed a combat formula Bug only** (DLL change only)
    - App: `1.2.0`
    - Hotfix: `13` (+1)
    - Content: `8` (Unchanged)

2. **Scenario: Changed a background image only** (Resource change only)
    - App: `1.2.0`
    - Hotfix: `13` (Unchanged)
    - Content: `9` (+1)

### 3.5 Startup Process & Manifest (UpdateManifest)

Client downloads `UpdateManifest.json` on startup:

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

**Update Check Logic**:

1. **App Check**: If `Remote.minAppVersion > Local.appVersion` -> Force Store Update.
2. **Manifest Comparison**:
    - If `Remote.hotfixVersion > Local.hotfixVersion` -> Download DLL.
    - If `Remote.contentVersion > Local.contentVersion` -> Update Addressables Catalog.
    - **Atomicity**: Only enter the game after BOTH (if needed) are downloaded/ready, preventing Code v13 from accessing non-existent Resource v9.

### 3.6 Rollback Strategy

- **Server-side Rollback**: Modify `UpdateManifest` to point back to old `hotfixVersion` or `contentVersion`.
- **Client Handling**: Client detects version change (even if lower), redownloads corresponding Catalog/DLL and overwrites cache.
- **Disaster Backup**: Always keep historical version directories on CDN (e.g., `/v8/`, `/v9/`), DO NOT overwrite files in the original path.

---

## 4. Next Steps

1. **Implement Addressables Replacement**: Modify `BuildAssetsCommand.cs`, remove `BuildPipeline`, integrate `AddressableAssetSettings.BuildPlayerContent()`.
2. **Develop Update Manager**: Implement the aforementioned Manifest check, download, and verification logic.
3. **Setup CI/CD**: Script the above Local/QA/Release processes (Jenkins/GitHub Actions).
