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

To solve the common synchronization issues between resources and code in hot updates, it is recommended to adopt a **three-track versioning** strategy for App, Resources, and Code.

### 3.1 Version Structure

It is recommended to maintain an `UpdateManifest.json` in `StreamingAssets` and the root directory of the remote CDN.

| Field | Description | Example |
| :--- | :--- | :--- |
| `appVersion` | Native App Version (Major.Minor.Patch) | `1.0.0` |
| `resVersion` | Addressables Resource Version (Catalog Hash or Timestamp) | `20240109_1530` |
| `dllVersion` | Code Version (Hash or Compile Count) | `v15` |
| `minAppVersion` | Minimum App Version required for mandatory full update | `0.9.5` |

**Manifest Example**:

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

### 3.2 Startup & Check Process

1. **Check Manifest**: App starts, requests remote `UpdateManifest.json`.
2. **App Version Check**:
   - `Remote.minAppVersion > Local.appVersion`: **Force App Update** (Jump to Store).
   - `Remote.appVersion == Local.appVersion`: Continue hotfix check.
3. **Resource/DLL Update**:
   - Compare `Local.resVersion` vs `Remote.resVersion`.
   - Compare `Local.dllVersion` vs `Remote.dllVersion`.
   - **Important**: Must ensure DLL and Resources are **atomically updated**. That is: if DLL is updated, the corresponding version of resources must also be in place, otherwise code might access non-existent resources.
4. **Download**:
   - `Addressables.UpdateCatalogs()`
   - Download new DLLs to persistent directory (`Application.persistentDataPath/Dlls`).
5. **Reload/Enter Game**: After download completes, if it's a DLL update, usually need to restart App or (in HybridCLR) reload domain.

### 3.3 Rollback Strategy

**Scenario**: v1.0.1 released, severe Crash found.

**Solution**:

1. **Server-side Rollback**: Modify remote `UpdateManifest.json`, pointing `resVersion` and `dllVersion` back to v1.0.0 config.
2. **Client Handling**:
   - Client detects remote version change (even if "downgrade").
   - Redownload v1.0.0 Catalog and DLL.
   - Overwrite local cache.
3. **Disaster Recovery (Force Fallback)**:
   - Keep complete files of the last 3 versions in CD process (Archive).
   - If CDN files are corrupted, Ops only need to overwrite `Backup/v1.0.0` back to `Release/Current`.

### 3.4 FAQ Solutions

| Issue | Solution |
| :--- | :--- |
| **Q1: Hotfix DLL and AOT metadata mismatch** | **Strong Version Binding**: AOT DLLs generated when packaging App must be archived. Every time hotfix DLL is compiled, the compile environment must use **exactly consistent** AOT DLLs (i.e., commit hash alignment). Recommended to record commit id in CI/CD. |
| **Q2: Addressables Catalog and resources inconsistent** | **Catalog in Version Directory**: Do not overwrite root `catalog.json`, instead use `/v1.0.1/catalog.json`. `UpdateManifest` points to specific catalog url. |
| **Q3: Dirty Cache** | **Hash Verification**: Every download must verify MD5. If verification fails, delete the file and retry. Can provide "Clear Cache" button in Debug panel. |
| **Q4: Network interruption during hotfix** | **Resumable Download & Temp Directory**: Download files to `.temp`, only move to formal directory after full download + verification. Avoid loading partially updated files. |
| **Q5: Crash after update, cannot start** | **Safe Mode**: Record `LastSuccessVersion`. If consecutive Crashes occur 3 times after startup, automatically clear hotfix cache, rollback to original version in `StreamingAssets`, and report error. |

## 4. Next Steps

1. **Implement Addressables Replacement**: Modify `BuildAssetsCommand.cs`, remove `BuildPipeline`, integrate `AddressableAssetSettings.BuildPlayerContent()`.
2. **Develop Update Manager**: Implement the aforementioned Manifest check, download, and verification logic.
3. **Setup CI/CD**: Script the above Local/QA/Release processes (Jenkins/GitHub Actions).
