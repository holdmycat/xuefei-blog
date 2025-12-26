---
title: "Zenject SubContainer Usage in Commander Architecture"
date: 2025-12-26T08:55:00+08:00
draft: false
tags: ["Architecture", "Zenject", "Unity"]
---

# Zenject SubContainer Usage in Commander Architecture

This document details the reasons, implementation, and core design issues resolved by introducing Zenject SubContainer for the Commander-Legion-Squad hierarchy in the `Modular-Skill-System-Demo` project.

## 1. The Problem

In the version prior to refactoring, our Commander system consisted of the following hierarchy:
`Commander` -> (contains multiple) `Legion` -> (contains multiple) `Squad`

There was a requirement for **shared data** across these levels. For example:

- **Faction**: The entire Commander and all its subordinate units belong to the same faction.
- **LegionId**: Squads belonging to the same Legion need to know their LegionId.
- **CommanderBootstrapInfo**: Initial configuration data.

## 2. Previous Logic

Before introducing the advanced features of the DI (Dependency Injection) container, we adopted a **Manual Parameter Propagation** approach.

The code logic was roughly as follows:

```csharp
// ServerCommander.cs
public void Configure(CommanderBootstrapInfo info) {
    var faction = info.Seed.Faction;
    // Manually pass to the next layer
    _legion.Configure(legionId, faction);
}

// ServerLegion.cs
public void Configure(ulong legionId, FactionType faction) {
    // Manually pass to the next layer again
    foreach(var squad in _squads) {
        squad.Configure(legionId, faction);
    }
}
```

## 3. Why it violated DI Principles

This "layer-by-layer parameter passing" approach had significant architectural flaws:

1. **Parameter Drilling**: The `Legion` layer itself might not need the `Faction` data, but in order to pass it to the `Squad`, it must include this parameter in its `Configure` method. This leads to code bloat in the middle layer and coupling with business logic it shouldn't care about.
2. **Opaque Dependencies**: `Squad` has a strong dependency on `Faction` data. In ideal DI design, dependencies should be declared in the **constructor**. Using the `Configure` method for passing means that the object is in a "semi-initialized" state after being constructed (`new` or `Factory.Create`) until someone calls `Configure`.
3. **Violation of Inversion of Control (IoC)**: The upper-level object (Commander) must explicitly manage the data dependencies of the lower-level object (Legion), rather than letting the container resolve the dependencies.

## 4. SubContainer Solution

To solve the above problems, we introduced the concepts of **Zenject SubContainer** and **Scoped Context**.

### Core Idea

Create an independent **DI Scope** for each `Commander` instance. Within this scope, we place a shared data object `CommanderContextData`. All child objects (Legion, Squad) created under this scope can inject this data object directly from the container.

### Implementation Details

#### A. Define Context Data

We created a POCO class to hold shared data within the scope:

```csharp
public class CommanderContextData {
    public FactionType Faction;
    public ulong LegionId;
    // ...
}
```

#### B. Bind SubContainer

In `ShowcaseInstaller`, instead of binding the Factory directly, we use `FromSubContainerResolve`:

```csharp
Container.BindFactory<ServerCommander, ServerCommander.Factory>()
    .FromSubContainerResolve()
    .ByMethod(InstallServerCommander) // <--- Create a sub-container for each Commander
    .AsSingle();

private void InstallServerCommander(DiContainer subContainer) {
    // 1. Bind ContextData within the sub-container (Singleton)
    subContainer.Bind<CommanderContextData>().AsSingle();
    
    // 2. Bind the Commander itself within the sub-container
    subContainer.Bind<ServerCommander>().AsSingle();
    
    // 3. Key: Bind the Factory of child objects within the sub-container
    // This way, objects produced by the Factory are also within this Scope and can access the ContextData above
    subContainer.BindFactory<ServerLegion, ServerLegion.Factory>().AsSingle();
    subContainer.BindFactory<ServerSquad, ServerSquad.Factory>().AsSingle();
}
```

#### C. Production and Consumption of Data

1. **Production (Assignment)**:
    When `ServerCommander` is created, Zenject injects an empty `CommanderContextData`. The Commander populates this object in its initialization logic (after reading config):

    ```csharp
    // ServerCommander.cs
    public override void Configure(CommanderBootstrapInfo info) {
        _contextData.Faction = info.Seed.Faction; // <--- Write data
    }
    ```

2. **Consumption (Injection)**:
    When the Commander later calls `LegionFactory.Create()`, since the Factory is also in the same SubContainer, the `ServerLegion` produced will automatically inject the **same** `CommanderContextData` instance.

    ```csharp
    // ServerLegion.cs
    [Inject]
    public ServerLegion(CommanderContextData context) {
        this._faction = context.Faction; // <--- Read directly, no parent passing needed
    }
    ```

### Summary

By using SubContainer, we achieved:

- **Data Decoupling**: The parent no longer needs to explicitly pass data to the child via parameter lists.
- **Constructor Injection**: `Legion` and `Squad` obtain required data at construction time, making the lifecycle safer.
- **Scope Isolation**: Different Commander instances have their own independent `CommanderContextData`, without interfering with each other.
