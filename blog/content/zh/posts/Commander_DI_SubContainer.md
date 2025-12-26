---
title: "Zenject SubContainer 在 Commander 体系中的应用"
date: 2025-12-26T08:52:00+08:00
draft: false
tags: ["Architecture", "Zenject", "Unity"]
---

# Zenject SubContainer 在 Commander 体系中的应用

本文档详细解释了在 `Modular-Skill-System-Demo` 项目中，针对 Commander-Legion-Squad 层级结构引入 Zenject SubContainer 的原因、实施方案及其解决的核心设计问题。

## 1. 问题背景 (The Problem)

在重构之前的版本中，我们的 Commander 系统包含以下层级：
`Commander` -> (包含多个) `Legion` -> (包含多个) `Squad`

这些层级之间存在**共享数据**的需求。例如：

- **Faction (阵营)**: 整个 Commander 及其下属的所有单位都属于同一个阵营。
- **LegionId**: 属于同一个 Legion 的 Squad 需要知道自己的 LegionId。
- **CommanderBootstrapInfo**: 初始化的配置数据。

## 2. 之前的做法 (Previous Logic)

在引入 DI (依赖注入) 容器的高级特性之前，我们采用了**手动参数传递 (Manual Parameter Propagation)** 的方式。

代码逻辑大致如下：

```csharp
// ServerCommander.cs
public void Configure(CommanderBootstrapInfo info) {
    var faction = info.Seed.Faction;
    // 手动传给下一层
    _legion.Configure(legionId, faction);
}

// ServerLegion.cs
public void Configure(ulong legionId, FactionType faction) {
    // 再次手动传给下一层
    foreach(var squad in _squads) {
        squad.Configure(legionId, faction);
    }
}
```

## 3. 为什么这违背了 DI 原则 (Why it violated DI)

这种“逐层传参”的做法存在显著的架构缺陷：

1. **参数穿透 (Parameter Drilling)**: `Legion` 层级本身可能并不需要 `Faction` 数据，但为了传给 `Squad`，它必须在其 `Configure` 方法中包含这个参数。这导致中间层代码膨胀，且与它不必关心的业务逻辑耦合。
2. **依赖不透明**: `Squad` 强依赖于 `Faction` 数据。在理想的 DI 设计中，依赖应该在**构造函数**中声明。使用 `Configure` 方法传递意味着对象在被构造（`new` 或 `Factory.Create`）之后，处于一个“半初始化”状态，直到有人调用 `Configure` 为止。
3. **违反控制反转 (IoC)**: 上层对象（Commander）必须显式地管理下层对象（Legion）的数据依赖，而不是让容器来解决依赖。

## 4. SubContainer 解决方案 (SubContainer Solution)

为了解决上述问题，我们引入了 **Zenject SubContainer (子容器)** 和 **Scoped Context (作用域上下文)** 的概念。

### 核心思想

为每一个 `Commander` 实例创建一个独立的 **DI Scope (作用域)**。在这个作用域内，我们放置一个共享的数据对象 `CommanderContextData`。在这个作用域下创建的所有子对象（Legion, Squad），都可以直接从容器中注入这个数据对象。

### 实现细节

#### A. 定义上下文数据

我们创建了一个 POCO 类来持有作用域内的共享数据：

```csharp
public class CommanderContextData {
    public FactionType Faction;
    public ulong LegionId;
    // ...
}
```

#### B. 绑定 SubContainer

在 `ShowcaseInstaller` 中，我们不再直接绑定 Factory，而是使用 `FromSubContainerResolve`：

```csharp
Container.BindFactory<ServerCommander, ServerCommander.Factory>()
    .FromSubContainerResolve()
    .ByMethod(InstallServerCommander) // <--- 为每个 Commander 创建子容器
    .AsSingle();

private void InstallServerCommander(DiContainer subContainer) {
    // 1. 在子容器内绑定 ContextData (单例)
    subContainer.Bind<CommanderContextData>().AsSingle();
    
    // 2. 在子容器内绑定 Commander 本身
    subContainer.Bind<ServerCommander>().AsSingle();
    
    // 3. 关键：在子容器内绑定子对象的 Factory
    // 这样 Factory 生产出来的对象也在这个 Scope 内，能访问到上面的 ContextData
    subContainer.BindFactory<ServerLegion, ServerLegion.Factory>().AsSingle();
    subContainer.BindFactory<ServerSquad, ServerSquad.Factory>().AsSingle();
}
```

#### C. 数据的生产与消费

1. **生产 (赋值)**:
    当 `ServerCommander` 被创建时，Zenject 会注入一个空的 `CommanderContextData`。Commander 在其初始化逻辑中（读取配置后）填充这个对象：

    ```csharp
    // ServerCommander.cs
    public override void Configure(CommanderBootstrapInfo info) {
        _contextData.Faction = info.Seed.Faction; // <--- 写入数据
    }
    ```

2. **消费 (注入)**:
    当 Commander 稍后调用 `LegionFactory.Create()` 时，因为 Factory 也在同一个 SubContainer 中，它生产的 `ServerLegion` 会自动注入**同一个** `CommanderContextData` 实例。

    ```csharp
    // ServerLegion.cs
    [Inject]
    public ServerLegion(CommanderContextData context) {
        this._faction = context.Faction; // <--- 直接读取，无需父级传递
    }
    ```

### 总结

通过使用 SubContainer，我们实现了：

- **数据解耦**: 父级不再需要通过参数列表显式传递数据给子级。
- **构造注入**: `Legion`和`Squad`在构造时刻就拿到了所需数据，生命周期更加安全。
- **作用域隔离**: 不同的 Commander 实例拥有各自独立的 `CommanderContextData`，互不干扰。
