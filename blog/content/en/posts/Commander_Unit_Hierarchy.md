---
title: "Commander & Unit Hierarchy Architecture"
date: 2025-12-25
tags: ["Architecture", "System Design", "Zenject"]
draft: false
---

# Commander & Unit Hierarchy Architecture

## 1. Context

In large-scale SLG combat systems, units exhibit a strict hierarchy: **Commander -> Legion -> Phalanx -> Soldier**.
In the current project (`Modular-Skill-System-Demo`), the `Commander` has been implemented as the core entity for network synchronization, utilizing Zenject for dependency injection and lifecycle management.
To scale this to battles involving thousands of units on screen, we need to define how this four-layer architecture maps to Zenject's `Factory` pattern and the `DataCtrl` data flow.

## 2. Decision

We will adopt a **Nested Factory Pattern** combined with a **Data-Driven** approach to build this hierarchy.

### 2.1 Core Mapping Design

| Concept | Class/Interface (Existing/Proposed) | Responsibility | Zenject Pattern |
| :--- | :--- | :--- | :--- |
| **Commander** | `ServerCommander` / `ClientCommander` | Player agent, holds global skills, manages subordinate Legions. | `BindFactory<Commander, Factory>` |
| **Legion** | `LegionController` (Proposed) | Tactical unit, contains multiple Phalanxes, handles pathfinding macro-commands. | `BindFactory<Legion, Factory>` |
| **Phalanx** | `PhalanxController` (Proposed) | Formation unit, maintains formation shape, manages local state of soldiers. | `BindFactory<Phalanx, Factory>` |
| **Soldier** | `SoldierEntity` (Proposed) | Minimal rendering/logic unit, executes specific animations and damage checks. | `MemoryPool` (Performance sensitive) |

### 2.2 Zenject Factory Cascading

The current `GameInstaller` and `ShowcaseInstaller` have already demonstrated the top-level injection pattern:

```csharp
// ShowcaseInstaller.cs
Container.BindFactory<ServerCommander, ServerCommander.Factory>().AsSingle();
Container.BindFactory<ClientCommander, ClientCommander.Factory>().AsSingle();
```

Future hierarchical extensions will follow the principle of **"Parent holds Child Factory"**:

1. **Commander** injects `Legion.Factory`.
2. **Legion** injects `Phalanx.Factory`.
3. **Phalanx** injects `Soldier.Pool` (since the number of soldiers is massive, using an Object Pool is superior to a standard Factory).

## 3. Concept Clarification

To eliminate ambiguity, we specifically define the meaning and code implementation of **Nested Factory Pattern** and **Data-Driven** in our project.

### 3.1 Nested Factory Pattern

**Definition**:
Refers to a dependency injection pattern where a **Parent object holds the Factory for its Child objects**. This is opposed to a "God Factory" pattern, where a global manager spawned objects at all levels.

**Code Representation**:
It’s not just about the `Container.BindFactory` syntax in Zenject itself, but about **who uses the Factory**.

* **Misconception**: It just means Binding a Factory in an Installer.
* **Correct Understanding**: The `ServerCommander` class internally injects `ServerLegion.Factory`, and the Commander itself decides when to create a Legion.

**Code Example**:

```csharp
// 1. Parent
public class ServerCommander : BaseCommander 
{
    private readonly ServerLegion.Factory _legionFactory; // <--- Holds Child Factory

    [Inject]
    public ServerCommander(ServerLegion.Factory factory) // <--- Dependency Injection
    {
        _factory = factory;
    }

    public void SpawnLegion() 
    {
        // 2. Parent decides to create, passing context
        var legion = _legionFactory.Create(); 
        // ... Init legion ...
    }
}
```

**Intent**:
This pattern ensures **Encapsulation**. The outside world (e.g., `GameManager`) doesn't need to know about `Legion`; it only tells the `Commander` to "Start Battle," and the Commander uses its held factory to construct its subordinate troops.

### 3.2 Data-Driven

**Definition**:
Refers to the complete separation of **Runtime Logic** and **Data Definition**.
In this project, specific data carriers include:

1. **Static Config**: `ScriptableObject` (e.g., `LegionConfig`) or `DataGraph` (Node Graph).
2. **Dynamic Payload**: `SpawnPayload` (Binary/BSON), used for network transmission.

**Code Representation**:
When a Factory creates an object (e.g., `Create()`), it is often parameterless or has only generic parameters. After creation, the object must be driven by data via `Configure(data)` or `InitFromPayload(payload)`.

**Flow Example**:

1. **Data**: Designer configures `LegionConfig_A` (contains 3 Archer Phalanxes).
2. **Logic**: Code only contains a generic `LegionController` class.
3. **Drive**:
    * Factory creates a blank `LegionController`.
    * Call `Configure(LegionConfig_A)`.
    * `LegionController` reads config, sees need for 3 Phalanxes, loops 3 times calling `PhalanxFactory.Create()`.

## 4. Details

### 4.1 Existing Implementation: Commander

The `ClientCommander` is currently created via the `ClientRoomManager`, with its dependencies (e.g., `IDataLoaderService`) automatically injected by Zenject. This ensures that whenever a Commander is spawned, it has access to the latest global services.

```csharp
public class ClientCommander : BaseCommander
{
    private readonly IDataLoaderService _dataLoaderService;
    
    [Inject]
    public ClientCommander(IDataLoaderService dataLoaderService)
    {
        _dataLoaderService = dataLoaderService;
    }
    // ...
}
```

### 4.2 Proposed Implementation: Massive Unit Hierarchy

To handle thousands of soldiers, low-level objects (Soldiers) should not be bound deep into the Zenject container as independent `GameObjects`. Instead, they should use a lightweight **Zenject Memory Pool**.

```csharp
// Pseudo-code example
public class PhalanxController : MonoBehaviour
{
    private SoldierEntity.Pool _soldierPool;
    private List<SoldierEntity> _soldiers = new();

    [Inject]
    public void Construct(SoldierEntity.Pool soldierPool)
    {
        _soldierPool = soldierPool;
    }

    public void FormUp(int count)
    {
        for(int i=0; i<count; i++) {
            var soldier = _soldierPool.Spawn();
            _soldiers.Add(soldier);
        }
    }
}
```

## 5. Summary

* **Commander** serves as the anchor for the dual-world architecture, using Zenject Factory to ensure correct initialization of Network ID (`NetId`) and dependencies.
* **Legion/Phalanx** will act as intermediate layers, continuing to use the Factory pattern for logic encapsulation.
* **Soldier**, as a massive entity, shifts architecturally from "Dependency Injection" to "Memory Pool Management" to trade off for rendering performance.
* This layered design perfectly fits the SLG "LOD" (Level of Detail) logic—Commanders care about tactics (Legion), Phalanxes care about formation (Phalanx), and only the bottom layer cares about rendering soldiers (Soldier).
