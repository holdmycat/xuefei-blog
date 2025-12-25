---
title: "Framework Risk Assessment: Performance & Architecture"
date: 2025-12-25
tags: ["Architecture", "Performance", "Risk Assessment"]
draft: false
---

# Framework Risk Assessment

## 1. Executive Summary

The current architecture excels in **Modularity** and **Network Decoupling**, especially with the `Dual-World` isolation and `SimulatedNetworkBus`.
However, for the high-performance requirements of SLG "Thousand Units on Screen", specific design choices impose **Severe Performance Risks**, particularly regarding the Update loop and Skill System memory overhead.

## 2. Critical Risks

### 2.1 Performance Risks

> [!WARNING]
> **Risk Level: High**
> **Update Catalyst**: If every Soldier acts as a MonoBehaviour with an independent `Update()` loop, the CPU will be exhausted by C# <=> Native context overhead when unit counts reach 1000+.

* **Current State**: `ClientManager` and `ServerManager` currently rely on Unity's `Update` / `Tick`. While `ServerManager` attempts to encapsulate `Tick`, there is no visible `UpdateManager` design pattern at the Soldier level.
* **Recommendation**: Must implement a **Centralized Manager Update** pattern.
  * **Manager**: `LegionController` iterates and updates its soldiers.
  * **Native Array**: Consider using DOTS or simple Array structures for movement and combat calculations.

### 2.2 Skill System Scalability

> [!CAUTION]
> **Risk Level: High**
> **Graph Computation Overhead**: `NP_SupportSkillDataSupportor` indicates reliance on behavior trees/node graphs (`NPBehave`). If every minion instantiates a full behavior tree, Memory and CPU usage will explode.

* **Current State**: Skill data seems to be stored per node. If each entity performs a deep copy of the graph, performance will be unacceptable.
* **Recommendation**:
  * **Shared Data**: Ensure Behavior Tree data follows the Flyweight pattern; multiple soldiers share the same graph data.
  * **LOD Strategy**: Distant soldiers should not run full skill logic, but rather simplified numerical logic.

### 2.3 Dual-World Leakage

> [!IMPORTANT]
> **Risk Level: Medium**
> **Dependency Injection Misuse**: `ShowcaseInstaller` binds both `Server` and `Client` components. While bound separately, it is very easy to accidentally `[Inject]` a Client-only View component into a Server class, causing unit test failures or server build errors.

* **Current State**: `Container.Bind<ClientRoomManager>` and `Container.Bind<ServerRoomManager>` are in the same Installer.
* **Recommendation**:
  * Split into `ServerInstaller` and `ClientInstaller`, or use Zenject `SubContainer` to physically isolate dual-world contexts.

## 3. Action Plan

1. **Implement `UpdateManager`**: Deprecate `Monobehaviour.Update()` for all combat units.
2. **Skill Performance Test**: Create a stress test with 1000 units using skills (Profiler).
3. **Installer Split**: Attempt to isolate dual-world bindings into different Installers or Contexts.
