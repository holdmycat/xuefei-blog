---
title: "Architecture of NP Behavior Tree in Zenject Environment"
date: 2026-01-03T11:06:00+08:00
draft: false
tags: ["Architecture", "Zenject", "Unity", "BehaviorTree"]
---

## Problem Context

When implementing a Real-Time Strategy (SLG) game with a "Dual World" architecture, we need to run NP Behavior Trees (Node Parser Behavior Tree) within the Unity environment. This presents several core challenges:

1. **Dual World Isolation**: Both the Server and Client run within the same process, but their logic must be strictly isolated. They each possess independent `Clocks` (time drivers) and entity collections, and the behavior tree must know which world it belongs to.
2. **The Challenge of Dependency Injection (DI)**: Traditional behavior tree implementations often rely on global singletons (like `Singleton.Instance`) to access game state. In a Zenject architecture, we need to inject entities (owner, target) and services (time, logging) into the nodes, rather than having nodes "pull" global state.
3. **Dynamic Construction**: Behavior trees are usually data-driven (loaded from configuration), but their instantiation process requires dynamic injection of runtime Context.

## Previous Logic

Before introducing Zenject and the Dual World architecture, common practices included:

- Action nodes directly accessing `GameManager.Instance` or `RoomManager.Shared` to find entities.
- Behavior tree updates (Ticks) relying on `MonoBehaviour.Update`, often making execution order and frequency (Server Tick vs Client Tick) difficult to control.
- The instantiation process was hardcoded using `new RuntimeTree()`, making it difficult to replace data sources or inject mock objects for testing.

## Why it Violated Principles

- **High Coupling**: Nodes were tightly coupled with specific managers, making code difficult to unit test and reusable in different scenarios (such as a standalone server).
- **Violation of Inversion of Control (IoC)**: Nodes actively acquired dependencies instead of passively receiving them.
- **State Pollution**: Accidental access to Server entities within a Client tree could lead to state synchronization errors, breaking the "Server Authority" principle.

## Solution

We designed an architecture based on the Factory, Strategy, and Context Object patterns, managed by Zenject for dependencies.

### 1. Core Components

#### NPRuntimeTreeFactory (Factory)

- **Interface**: `INPRuntimeTreeFactory`
- **Responsibility**: Encapsulates the complex construction process. It doesn't just `new` an object; it assembles data, clocks, and context.
- **Flow**:
    1. Fetch static data (`NP_DataSupportor`) from `INPRuntimeTreeDataProvider`.
    2. Select the corresponding `Clock` from the Zenject container based on the `IsServer` flag (distinguished via `ClockIds.Server/Client`).
    3. Create an `NP_RuntimeTree` instance.
    4. Construct the **NPRuntimeContext**, injecting the `Resolver`.
    5. Call `tree.OnInitRuntimeTree(...)`, traversing and initializing all nodes, injecting the Context into action nodes.

#### INPRuntimeEntityResolver (Entity Resolution Strategy)

- **Responsibility**: Provides a unified interface for finding entities by ID.
- **Implementation**: The default implementation, `NetworkBusRuntimeEntityResolver`, delegates to `INetworkBus`, finding entities via `GetSpawnedOrNull(netId, isServer)`.
- **Advantage**: Behavior nodes do not need to know about the existence of `NetworkBus` or `RoomManager`; they only need to call `Resolve<T>(id)`.

#### NPRuntimeContext (Context Object)

- **Responsibility**: Carries runtime metadata (`IsServer`, `OwnerId`, `TargetId`) and service references (`Resolver`, `Log`).
- **Role**: Passed as an argument to action nodes. Action nodes acquire all necessary information via the Context, remaining stateless (or holding only the Context).

### 2. Collaboration Flow

1. **Injection Phase**: Bind `INPRuntimeTreeFactory`, `INPRuntimeTreeDataProvider`, and `INPRuntimeEntityResolver` in `ShowcaseInstaller`. Simultaneously bind the Dual World `Clocks`.
2. **Request Phase**: For example, when a `Commander` initializes, it calls `factory.Create(request)`, passing its own ID and the world it belongs to (Server/Client).
3. **Construction Phase**: The Factory automatically pulls data, matches the Clock, creates the Context, and assembles a complete behavior tree with dependency injection.
4. **Runtime Phase**:
    - `DualWorldSceneManager` drives respective `Clocks`.
    - `Clock` drives the behavior tree's `Tick`.
    - When an action node executes, it acquires the target entity via `Context.Resolve<T>(targetId)` and executes logic.

### 3. Code Example (Conceptual)

```csharp
// Created using Factory
var tree = _factory.Create(new NPRuntimeTreeBuildRequest 
{ 
    RootId = 1001, 
    EntityId = this.NetId, 
    IsServer = true 
});

// Inside an Action Node
protected override void OnExecute()
{
    // No longer accessing Singleton, resolving via Context instead
    var target = Context.Resolve<BaseCommander>(TargetId);
    if (target != null)
    {
        target.TakeDamage(10);
    }
}
```

This architecture ensures the purity and testability of the behavior tree, as well as perfect support for the Dual World architecture.
