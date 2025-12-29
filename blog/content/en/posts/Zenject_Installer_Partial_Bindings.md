---
title: "Using Partial Classes for Local Debug Bindings in Zenject Installers"
date: 2025-12-29T09:43:00+08:00
draft: false
tags: ["Architecture", "Zenject", "Unity", "C#", "Team Collaboration"]
---

## 1. Problem Background

In large-scale game development (especially SLG titles), different developers often have unique local debugging needs. For instance, Client Developer A might need a set of shortcuts to toggle UI panels swiftly, while Client Developer B needs different tools to test combat logic.

Adding these debug bindings directly into the main `Installer` (e.g., `ShowcaseInstaller.cs`) creates several issues:

1. **Code Pollution**: Debug code gets mixed with core business logic, increasing maintenance costs.
2. **Merge Conflicts**: Multiple developers frequently modifying the same `Installer` file to add/remove their debug code leads to frequent Git merge conflicts.
3. **Accidental Commits**: Personal test code can easily be accidentally committed to the main branch, affecting others' environments or even production builds.

The traditional approach often uses `#if UNITY_EDITOR` macros, but this still doesn't solve file modification conflicts during multi-person collaboration.

## 2. Solution

To solve this, we leverage C#'s **Partial Class** and **Partial Method** features to implement a "zero-cost" hook for local debug bindings.

### Core Design

1. **Main Installer (Public Code)**
    Declare the main Installer class as `partial` and define a declaration for a partial method named `InstallLocalBindings`. Call this method at the end of `InstallBindings`.

2. **Local Installer (Local Code)**
    Developers create a separate file locally (e.g., `ShowcaseInstaller_Debug.cs`) that implements the same `partial` class and the concrete logic for the `InstallLocalBindings` method. **This file should be added to `.gitignore`**.

### Implementation

**Main File: `ShowcaseInstaller.cs` (Committed to Git)**

```csharp
public partial class ShowcaseInstaller : MonoInstaller
{
    public override void InstallBindings()
    {
        // ... Core binding logic ...

        // Call the local binding hook
        // If no other part implements this method, the compiler automatically removes this call (Zero overhead)
        InstallLocalBindings();
    }

    // Declare partial method
    partial void InstallLocalBindings();
}
```

**Local File: `ShowcaseInstaller_Debug.cs` (Added to .gitignore)**

```csharp
public partial class ShowcaseInstaller
{
    // Implement partial method
    partial void InstallLocalBindings()
    {
#if UNITY_EDITOR
        // Perform personal debug bindings here
        Container.Bind<ShowcaseDebugShortcuts>().FromNewComponentOnNewGameObject().AsSingle().NonLazy();
#endif
    }
}
```

## 3. Guide to Customization & Usage

This solution not only supports logical decoupling but also provides a basic visual debugging toolset. Here are the steps for developers to set up and use this system in their local environment:

### Step 1: Create Local Installer Extension

Create a new file in the `Assets/Scripts/Manager/Debug/` directory, recommended name is `ShowcaseInstaller_Debug.cs` (or any name you prefer, as long as the namespace is correct and it is covered by gitignore).

```csharp
using UnityEngine;
using Zenject;

namespace Ebonor.Manager
{
    // Note: Must use the 'partial' keyword, and the namespace must match the main Installer
    public partial class ShowcaseInstaller
    {
        partial void InstallLocalBindings()
        {
#if UNITY_EDITOR
            // Bind your own debug script
            Container.Bind<ShowcaseDebugShortcuts>().FromNewComponentOnNewGameObject().AsSingle().NonLazy();
#endif
        }
    }
}
```

### Step 2: Implement Specific Debug Logic

You can create a script inheriting from `BaseDebugShortcuts` to implement specific shortcut functions. The base class will automatically draw a help panel in the top-right corner of the screen.

**File: `ShowcaseDebugShortcuts.cs` (Local File)**

```csharp
using Ebonor.UI;
using UnityEngine;
using Zenject;

namespace Ebonor.Manager
{
    public class ShowcaseDebugShortcuts : BaseDebugShortcuts
    {
        [Inject] private UIManager _uiManager;

        private void Start()
        {
            // Register shortcuts
            Register(KeyCode.F5, "Open UI", () => _uiManager.OpenUIAsync<UIScene_ShowCaseScene>());
            Register(KeyCode.F6, "Close UI", () => _uiManager.CloseUIAsync<UIScene_ShowCaseScene>());
        }
    }
}
```

### Step 3: Configure Git Ignore

To ensure these local files are not committed, `.gitignore` is configured to ignore the contents of the `Assets/Scripts/Manager/Debug/` directory, but retains the base class file.

```gitignore
# Ignore all files in the Debug directory (Local debug scripts)
/[Aa]ssets/Scripts/Manager/Debug/

# Exception: Keep the base class file (as it is shared infrastructure)
!/[Aa]ssets/Scripts/Manager/Debug/BaseDebugShortcuts.cs
```

### Functional Verification

1. **Compilation**: Even without creating `ShowcaseInstaller_Debug.cs`, the project should compile normally (the compiler automatically ignores the partial method call).
2. **Runtime**: If local bindings are created, running the game and pressing **F1** should toggle the top-right debug panel, and configured shortcuts (e.g., F5/F6) should trigger corresponding logic.

## 4. Benefits

* **Complete Decoupling**: Physical separation of core logic and debug logic.
* **Zero Conflicts**: Eliminates merge conflicts in Installer files caused by personal debug needs.
* **Visual Support**: Provides a unified debug UI style via `BaseDebugShortcuts`.
* **Zero Overhead**: Without local files, the compiler automatically removes the call, causing absolutely no runtime performance impact on production builds.
