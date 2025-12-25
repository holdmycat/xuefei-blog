---
title: "Game Framework Architecture: Zenject-Driven Dual-World Simulation"
date: 2025-12-25
tags: ["Architecture", "Unity", "Zenject"]
draft: false
---

# Game Framework Architecture: Zenject-Driven Dual-World Simulation

## 1. Context

To support complex SLG gameplay and ensure a "Server-Authoritative" development model, we need a client architecture that satisfies the following requirements:

1. **Dual-World Simulation**: Ability to run both Server and Client logic within a single process for easy debugging.
2. **Dependency Injection**: Avoid the tight coupling and testing difficulties associated with the Singleton pattern.
3. **Clear Lifecycle**: Unified management of initialization, updates, and destruction for all systems.

## 2. Decision

We adopted a **Zenject**-based Dependency Injection framework combined with a **Dual-World** design pattern.

### 2.1 The Zenject Core

Core services no longer exist as MonoBehaviour Singletons. Instead, they are bound to the DI Container via `GlobalInstaller`.

- **Global Installer**: Binds globally unique services (e.g., `IInputService`, `ISceneLoaderService`, `ISystemDataService`).
- **Game Startup**: Uses the `IInitializable` interface as the non-MonoBehaviour entry point for the game.

### 2.2 The Dual Worlds

Game logic is strictly divided into two "worlds" that coexist in memory but are logically isolated:

1. **Server World**:
    - The core logic layer, responsible for calculations and state validation.
    - Contains objects like `ServerCommander`, `ServerLegion`.
    - **Authority**: Only the Server layer's state is the ultimate truth.
2. **Client World**:
    - The presentation layer, responsible for rendering, UI, and input collection.
    - Contains objects like `ClientCommander`, `ClientLegion`.
    - **Passive**: Synchronizes state by listening to RPCs/Commands sent from the Server.

### 2.3 Bootstrapping

`GamePlayEntry.cs` acts as the bootstrap script for the Unity scene:

1. **MonoBehaviour Entry**: `GamePlayEntry.Start()` is called.
2. **Service Check**: Verifies if `GlobalServices` are ready (Resource Loader, etc.).
3. **Client Manager**: Initializes `GameClientManager`, which serves as the bridge between the Unity scene lifecycle and the Zenject logic layer.

## 3. Core Domain Model & Data Relations

Addressing the complexity specific to SLG, we further clarified the relationships between Scenes, Data, and Unit Hierarchy.

### 3.1 Scene & External Data

The Unity Scene acts merely as a **container and rendering environment**; it does not store core game data.

- **External Data Authority**: All unit attributes, configuration tables, and skill data are stored in external files (ScriptableObject / BSON / JSON) and loaded uniformly by `IDataLoaderService` and `ISystemDataService`.
- **Scene Restoration**: `SceneLoaderService` handles scene loading, but the `LevelManager` or `Bootstrap` scripts within the scene are responsible for requesting data services to spawn units, rather than placing Prefabs directly in the scene.

### 3.2 Unit Hierarchy

To support "Thousand-Man Battles," we designed a four-layer architecture:

1. **Commander**: The player agent/hero.
    - *Responsibility*: Skill casting, global buffs, inventory management.
    - *Data*: Hero attributes, equipment data.
2. **Legion**: The tactical unit.
    - *Responsibility*: Accepting macro commands (move to coordinates, attack target), pathfinding calculation.
    - *Data*: Legion composition, morale values.
3. **Squad**: The formation unit.
    - *Responsibility*: Maintaining formation (phalanx, skirmish line), managing the life/death of subordinate soldiers.
    - *Data*: Formation config, unified metrics (e.g., aggregate health).
4. **Soldier/Unit**: The rendering/micro-operation unit.
    - *Responsibility*: Playing animations, executing attack actions, hit feedback.
    - *Note*: Only Soldiers are created/destroyed at high frequency, thus they are managed by a `MemoryPool` rather than a standard Zenject Factory.

### 3.3 Event-Driven Architecture

We discard tight coupling via traditional C# Events in favor of **Forward/Reverse Data Flow** and a **Global Event Bus**.

#### A. Forward/Reverse Logic

- **Forward Events (Command/Request)**: UI or AI expresses an "intent."
  - *Flow*: UI -> CommandBus -> Server -> Logic System
  - *Example*: Player clicks "Cast Skill" button -> sends `CastSkillCommand`.
- **Reverse Events (Data Sync/Response)**: Data changes drive presentation.
  - *Flow*: Server Logic -> NetworkBus -> Client Logic -> DataEventBus -> UI/View
  - *Example*: Skill CD updates -> Server syncs Time -> Client ViewModel updates -> UI progress bar changes.

#### B. UI Event Logic

The UI system does not directly hold game objects but listens to `IDataEventBus`.

- **Decoupling**: UI scripts (e.g., `SkillPanel`) inject `IDataEventBus`.
- **Listening**: `OnAttach<SkillCooldownEvent>(OnSkillCDUpdated)`.
- **Triggering**: When underlying data changes, `DataEventBus.OnValueChange(new SkillCooldownEvent(...))`.

## 4. Summary

This architecture achieves high decoupling through Zenject and lowers the barrier for developing real-time networked games via the Dual-World pattern. It allows us to breakpoint debug both server and client code within the same IDE, significantly boosting development efficiency. Furthermore, the clear hierarchy and data flow design ensure system performance and maintainability when handling massive unit counts.
