---
title: "Framework Risk Assessment: Performance & Architecture"
date: 2025-12-25
tags: ["Architecture", "Performance", "Risk Assessment"]
draft: false
---

# 架构风险评估报告 (Framework Risk Assessment)

## 1. 概览 (Executive Summary)

目前的架构在**模块化**和**网络解耦**方面做得很好，特别是双端世界隔离 (`Dual-World`) 和集中式网络总线 (`SimulatedNetworkBus`)。
然而，针对 SLG 品类“千人同屏”的高性能需求，目前的设计存在**严重的性能隐患**，特别是 Update 循环和技能系统的内存开销。

## 2. 关键风险 (Critical Risks)

### 2.1 性能风险 (Performance Risks)

> [!WARNING]
> **风险等级: 高 (High)**
> **Update 灾难**: 如果每个士兵 (Soldier) 都作为 MonoBehaviour 并拥有独立的 `Update()` 循环，当单位数量达到 1000+ 时，CPU 将被完全耗尽在 C# 和 Native 的切换开销上。

* **现状**: `ClientManager` 和 `ServerManager` 及其子组件目前依赖 Unity 的 `Update` / `Tick`。虽然 `ServerManager` 尝试封装 `Tick`，但在 Soldier 层级尚未见到 `UpdateManager` 的设计。
* **建议**: 必须实施 **Centralized Manager Update** 模式。
  * **Manager**: `LegionController` 负责轮询它的 soldiers。
  * **Native Array**: 考虑使用 DOTS 或简单的 Array 结构来处理移动和战斗计算。

### 2.2 技能系统扩展性 (Skill System Scalability)

> [!CAUTION]
> **风险等级: 高 (High)**
> **图计算开销**: `NP_SupportSkillDataSupportor` 表明技能系统依赖于行为树/节点图 (`NPBehave`)。如果每个小兵都实例化一棵完整的行为树，内存和 CPU 都会爆炸。

* **现状**: 技能数据似乎是按节点存储的。如果是每个实体一份深拷贝 graph，性能不可接受。
* **建议**:
  * **共享数据**: 确保行为树数据是 flyweight (享元) 模式，多个士兵共享同一份 graph 数据。
  * **LOD 策略**: 远处的士兵不运行完整技能逻辑，仅运行简化的数值逻辑。

### 2.3 双端泄露 (Dual-World Leakage)

> [!IMPORTANT]
> **风险等级: 中 (Medium)**
> **依赖注入误用**: `ShowcaseInstaller` 同时绑定了 `Server` 和 `Client` 组件。虽然现在分开 Bind，但很容易在某个 `Server` 类中不小心 `[Inject]` 一个只有 Client 存在的 View 组件，导致无法通过单元测试或服务器构建失败。

* **现状**: `Container.Bind<ClientRoomManager>` 和 `Container.Bind<ServerRoomManager>` 在同一个 Installer 中。
* **建议**:
  * 考虑拆分 `ServerInstaller` 和 `ClientInstaller`，或者使用 Zenject 的 `SubContainer` 来物理隔离双端 Context。

## 3. 改进计划 (Action Plan)

1. **实现 `UpdateManager`**: 废弃所有战斗单位的 `Monobehaviour.Update()`。
2. **技能性能测试**: 创建 1000 个使用技能的单位进行压力测试 (Profiler)。
3. **安装器拆分**: 尝试将双端绑定隔离到不同的 Installer 或 Context。
