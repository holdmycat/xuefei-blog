---
title: "游戏框架架构： Zenject 驱动的双端模拟"
date: 2025-12-25
tags: ["Architecture", "Unity", "Zenject"]
draft: false
---

# 游戏框架架构： Zenject 驱动的双端模拟

## 1. 背景 (Context)

为了支持复杂的 SLG 玩法并确保 "Server-Authoritative"（服务器权威）的开发模式，我们需要一个能够同时满足以下需求的客户端架构：

1. **双端模拟 (Dual-World Simulation)**: 能在单机单进程中同时运行 Server 逻辑和 Client 逻辑，方便开发调试。
2. **依赖注入 (Dependency Injection)**: 避免单例模式 (Singleton) 带来的紧耦合和测试困难。
3. **清晰的生命周期**: 统一管理各个系统的初始化、更新和销毁。

## 2. 架构决策 (Decision)

我们采用了基于 **Zenject** 的依赖注入框架，结合 **Dual-World** 设计模式。

### 2.1 Zenject 核心 (The Zenject Core)

所有的核心服务不再作为 Monobehaviour 单例存在，而是通过 `GlobalInstaller` 绑定到 DI 容器中。

- **Global Installer**: 负责绑定全局唯一的服务（如 `IInputService`, `ISceneLoaderService`, `ISystemDataService`）。
- **Game Startup**: 使用 `IInitializable` 接口作为游戏的非 MonoBehaviour 入口点。

### 2.2 双端世界 (The Dual Worlds)

游戏逻辑被严格划分为两个“世界”，它们在内存中共存但逻辑隔离：

1. **Server World**:
    - 核心逻辑层，负责运算、状态校验。
    - 包含 `ServerCommander`, `ServerLegion` 等对象。
    - **权威性**: 只有 Server 层的状态是最终真理。
2. **Client World**:
    - 表现层，负责渲染、UI 展示、输入采集。
    - 包含 `ClientCommander`, `ClientLegion` 等对象。
    - **被动性**: 通过监听 Server 发来的 RPC/Command 进行状态同步。

### 2.3 启动流程 (Bootstrapping)

`GamePlayEntry.cs` 作为 Unity 场景的引导脚本：

1. **Monobehaviour 入口**: `GamePlayEntry.Start()` 被调用。
2. **服务检查**: 检查 `GlobalServices` 是否就绪（资源加载器等）。
3. **Client Manager**: 初始化 `GameClientManager`，它是连接 Unity 场景生命周期和 Zenject 逻辑层的桥梁。

## 3. 核心领域模型与数据关联

针对 SLG 特有的复杂性，我们进一步明确了场景、数据与单位层级的关系。

### 3.1 场景与外部数据 (Data & Scene)

场景 (Unity Scene) 仅作为**容器和渲染环境**，不存储核心游戏数据。

- **外部数据权威**: 所有单位属性、配置表、技能数据均存储在外部文件（ScriptableObject / BSON / JSON）中，由 `IDataLoaderService` 和 `ISystemDataService` 统一加载。
- **场景还原**: `SceneLoaderService` 负责加载场景，但场景内的 `LevelManager` 或 `Bootstrap` 脚本只负责请求数据服务来生成单位，而非直接在场景中摆放 Prefab。

### 3.2 单位层级 (Unit Hierarchy)

为了支撑千人同屏，我们设计了四层架构：

1. **指挥官 (Commander)**: 玩家代理/英雄。
    - *职责*: 技能释放、全局 Buff、背包管理。
    - *数据*: 英雄属性、装备数据。
2. **军团 (Legion)**: 战术单元。
    - *职责*: 接受宏观指令（移动到坐标、攻击目标），寻路计算。
    - *数据*: 军团编制、士气值。
3. **方阵 (Squad)**: 阵型单元。
    - *职责*: 保持队形（方阵、散兵线），管理下属士兵的死活。
    - *数据*: 阵型配置、统一度量衡（如整体血量）。
4. **士兵 (Soldier/Unit)**: 渲染/微操单元。
    - *职责*: 播放动画、执行攻击动作、受击反馈。
    - *注意*: 只有 Soldier 是高频创建/销毁的，因此由 `MemoryPool` 管理，而非普通的 Zenject Factory。

### 3.3 数据事件驱动 (Event Architecture)

我们摒弃了传统的 C# Event 直接耦合，转而采用 **正向/反向数据流** 和 **全局事件总线**。

#### A. 正向/反向数据 (Forward/Reverse Logic)

- **正向事件 (Command/Request)**: UI 或 AI 发出“意图”。
  - *流向*: UI -> CommandBus -> Server -> Logic System
  - *示例*: 玩家点击“释放技能”按钮 -> 发送 `CastSkillCommand`。
- **反向事件 (Data Sync/Response)**: 数据变更驱动表现。
  - *流向*: Server Logic -> NetworkBus -> Client Logic -> DataEventBus -> UI/View
  - *示例*: 技能 CD 更新 -> Server 同步 Time -> Client ViewModel 更新 -> UI 进度条变化。

#### B. UI 事件逻辑

UI 系统不直接持有游戏对象，而是监听 `IDataEventBus`。

- **解耦**: UI 脚本 (e.g., `SkillPanel`) 注入 `IDataEventBus`。
- **监听**: `OnAttach<SkillCooldownEvent>(OnSkillCDUpdated)`。
- **触发**: 当底层数据发生变化时，`DataEventBus.OnValueChange(new SkillCooldownEvent(...))`。

## 4. 总结 (Summary)

该架构通过 Zenject 实现了高度解耦，通过 Dual-World 模式降低了即时制网络游戏的开发门槛。它允许我们在同一个 IDE 中同时断点调试服务器和客户端代码，极大地提高了开发效率。同时，明确的层级和数据流设计保证了系统在应对海量单位时的性能和可维护性。
