---
title: "Game Version Update Management Rules"
date: 2026-01-11T14:40:00+08:00
draft: false
tags: ["Build Pipeline", "Versioning", "Addressables", "Hotfix", "DevOps"]
---

# Game Version Update Management Rules

> **Scope**: This document applies to the **LocalCDN / OnlineTest** workflow and defines its relationship with the official **release/hotfix** baseline.

## 1. AppVersion (Release Baseline)

* **Locking Principle**: `AppVersion` is determined and locked **only** on `release/*` or `hotfix/*` branches. This is the version anchor.
* **Development Environment Behavior**: **LocalCDN / OnlineTest MUST NOT modify AppVersion**.
  * Even during local development (`dev` branch), built packages should follow the current mainline or release baseline version (i.e., the currently locked `AppVersion`).
  * **Prohibited**: Changing `AppVersion` arbitrarily during daily development/testing is forbidden, as it changes the hot-update path and necessitates unnecessary full package updates.

## 2. BuildRevision (Build Counter)

* **Auto-Increment**: **Automatically +1 for every build**. This serves as a pipeline counter.
* **Reset Rule**: **Reset to 0 only when AppVersion changes**.
  * Example: When switching from `1.2.0` to `1.3.0`, `BuildRevision` resets to 0 or 1 (depending on project convention).
* **LocalCDN Exception**:
  * In LocalCDN mode, `BuildRevision` is **valid only for personal self-testing**.
  * Its purpose is to distinguish multiple self-test builds on **your local machine/account**.
  * **It is NOT a basis for strict consistency across the team** and should not affect other developers' version versioning.

## 3. Content / DLL / Catalog Version (Artifact-Driven)

These versions (`contentVersion` / `dllVersion` / `catalogVersion`) are core to hot-updates and should be **driven by changes in build artifacts**.

* **Increment Rule**:
  * Build output changes (e.g., Hash change, file size change) → Corresponding version increments (following existing auto-increment logic).
  * If there are no substantial content changes, the version number remains unchanged (Idempotency).
* **Reset Rule**:
  * **When AppVersion changes**, all the above hot-update versions are **unified and reset to 1**.
  * **Reason**: A new `AppVersion` implies a new "Base Package"; the content within this base package effectively becomes "Version 1" of that major version.

## 4. LocalCDN Version Retention & Cleanup Strategy

To prevent disk explosion in the local testing environment, historical version retention must be limited.

* **Retention Policy**: **Keep only the recent N** version directories (Default recommendation `N = 5`).
* **Cleanup Mechanism**: When the total number of versions **exceeds N**, the build script should automatically clean up the oldest version directory.
* **Index File**: `latest.json` **always points to the latest built version**.
  * It serves as the "Entry Index" for LocalCDN.
  * Clients or test tools in Local mode default to requesting `latest.json` to locate the latest available hot-update version.
