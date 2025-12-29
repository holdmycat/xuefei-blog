---
title: "使用 Partial Class 实现 Zenject Installer 的本地调试绑定"
date: 2025-12-29T09:43:00+08:00
draft: false
tags: ["Architecture", "Zenject", "Unity", "C#", "Team Collaboration"]
---

## 1. 问题背景 (Problem)

在大型游戏项目（特别是SLG品类）的协同开发中，不同的开发者往往有不同的本地调试需求。例如，客户端开发A可能需要一组快捷键来快速开关UI，而客户端开发B可能需要另一组快捷键来测试战斗逻辑。

如果直接在主 `Installer`（如 `ShowcaseInstaller.cs`）中添加这些调试绑定，会带来以下问题：

1. **代码污染**：调试代码混入核心业务逻辑，增加了维护成本。
2. **合并冲突**：多名开发者频繁修改同一个 `Installer` 文件来添加/删除自己的调试代码，导致 Git 合并冲突频发。
3. **误提交**：个人的测试代码容易被意外提交到主分支，影响其他人的开发环境甚至生产环境。

以前的做法通常是使用 `#if UNITY_EDITOR` 宏，但这仍然无法解决多人协作时的文件修改冲突问题。

## 2. 解决方案 (Solution)

为了解决这个问题，我们利用 C# 的 **Partial Class（分部类）** 和 **Partial Method（分部方法）** 特性，实现“零成本”的本地调试绑定挂钩。

### 核心设计

1. **Main Installer (公共代码)**
    将主 Installer 类声明为 `partial`，并定义一个名为 `InstallLocalBindings` 的分部方法声明。在 `InstallBindings` 的末尾调用该方法。

2. **Local Installer (本地代码)**
    开发者在本地创建一个独立的文件（例如 `ShowcaseInstaller_Debug.cs`），实现同一个 `partial` 类和 `InstallLocalBindings` 方法的具体逻辑。**该文件应被加入 `.gitignore`**。

### 代码实现

**主文件：`ShowcaseInstaller.cs` (提交到 Git)**

```csharp
public partial class ShowcaseInstaller : MonoInstaller
{
    public override void InstallBindings()
    {
        // ... 核心绑定逻辑 ...

        // 调用本地绑定挂钩
        // 如果没有其他部分实现此方法，编译器会自动移除此调用，零性能开销
        InstallLocalBindings();
    }

    // 声明分部方法
    partial void InstallLocalBindings();
}
```

**本地文件：`ShowcaseInstaller_Debug.cs` (加入 .gitignore)**

```csharp
public partial class ShowcaseInstaller
{
    // 实现分部方法
    partial void InstallLocalBindings()
    {
#if UNITY_EDITOR
        // 在这里进行个人的调试绑定
        Container.Bind<ShowcaseDebugShortcuts>().FromNewComponentOnNewGameObject().AsSingle().NonLazy();
#endif
    }
}
```

## 3. 自定义与使用指南 (Guide to Customization & Usage)

本方案不仅支持逻辑解耦，还提供了一套基础的可视化调试工具。以下是开发者如何在本地环境中设置和使用这套系统的步骤：

### 第一步：创建本地 Installer 扩展

在 `Assets/Scripts/Manager/Debug/` 目录下创建一个新文件，建议命名为 `ShowcaseInstaller_Debug.cs`（或其他自己喜欢的名字，只要 namespace 正确且被 gitignore 包含）。

```csharp
using UnityEngine;
using Zenject;

namespace Ebonor.Manager
{
    // 注意：必须使用 partial 关键字，且 namespace 与主 Installer 保持一致
    public partial class ShowcaseInstaller
    {
        partial void InstallLocalBindings()
        {
#if UNITY_EDITOR
            // 绑定你自己的调试脚本
            Container.Bind<ShowcaseDebugShortcuts>().FromNewComponentOnNewGameObject().AsSingle().NonLazy();
#endif
        }
    }
}
```

### 第二步：实现具体的调试逻辑

你可以创建一个继承自 `BaseDebugShortcuts` 的脚本来实现具体的快捷键功能。基类会自动在屏幕右上角绘制一个帮助面板。

**文件：`ShowcaseDebugShortcuts.cs` (本地文件)**

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
            // 注册快捷键
            Register(KeyCode.F5, "Open UI", () => _uiManager.OpenUIAsync<UIScene_ShowCaseScene>());
            Register(KeyCode.F6, "Close UI", () => _uiManager.CloseUIAsync<UIScene_ShowCaseScene>());
        }
    }
}
```

### 第三步：配置 Git Ignore

为了确保这些本地文件不被提交，`.gitignore` 已配置为忽略 `Assets/Scripts/Manager/Debug/` 目录下的内容，但保留了基类文件。

```gitignore
# 忽略 Debug 目录下的所有文件 (本地调试脚本)
/[Aa]ssets/Scripts/Manager/Debug/

# 例外：保留基类文件 (因为它是共享的基础设施)
!/[Aa]ssets/Scripts/Manager/Debug/BaseDebugShortcuts.cs
```

### 功能验证

1. **编译通过**：即使没有创建 `ShowcaseInstaller_Debug.cs`，项目也应能正常通过编译（编译器会自动忽略 partial 方法调用）。
2. **运行时**：如果创建了本地绑定，运行游戏后按 **F1** 可以开关右上角的调试面板，按配置的快捷键（如 F5/F6）应能触发对应逻辑。

## 4. 优势 (Benefits)

* **完全解耦**：核心逻辑与调试逻辑物理分离。
* **零冲突**：杜绝了因个人调试需求导致的 Installer 文件合并冲突。
* **可视化支持**：通过 `BaseDebugShortcuts` 提供了统一的调试 UI 风格。
* **零开销**：无本地文件时，编译器自动移除调用，对打包发布的性能无任何影响。
