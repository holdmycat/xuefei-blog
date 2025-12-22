---
title: "Commander & Unit Hierarchy Architecture - Zenject Factory Pattern"
date: 2025-12-22
tags: ["Architecture", "Zenject", "SLG", "Unity"]
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

## 3. Details

### 3.1 Existing Implementation: Commander

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

### 3.2 Proposed Implementation: Massive Unit Hierarchy

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

## 4. Summary

* **Commander** serves as the anchor for the dual-world architecture, using Zenject Factory to ensure correct initialization of Network ID (`NetId`) and dependencies.
* **Legion/Phalanx** will act as intermediate layers, continuing to use the Factory pattern for logic encapsulation.
* **Soldier**, as a massive entity, shifts architecturally from "Dependency Injection" to "Memory Pool Management" to trade off for rendering performance.
* This layered design perfectly fits the SLG "LOD" (Level of Detail) logic—Commanders care about tactics (Legion), Phalanxes care about formation (Phalanx), and only the bottom layer cares about rendering soldiers (Soldier).
