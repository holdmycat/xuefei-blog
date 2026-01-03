---
title: "NP 行为树在 Zenject 环境下的构建与运行时架构"
date: 2026-01-03T11:06:00+08:00
draft: false
tags: ["Architecture", "Zenject", "Unity", "BehaviorTree"]
---

## 问题背景 (Problem)

在实现“双世界”（Dual World）架构的即时战略（SLG）游戏中，我们需要在 Unity 环境下运行 NP 行为树（Node Parser Behavior Tree）。这面临几个核心挑战：

1. **双世界隔离**：服务器（Server）和客户端（Client）在同一进程中运行，但逻辑必须严格隔离。它们各自拥有独立的 `Clock`（时间驱动）和实体集合，行为树必须知道自己隶属于哪个世界。
2. **依赖注入（DI）这一难题**：传统的行为树实现往往依赖全局单例（如 `Singleton.Instance`）来获取游戏状态。在 Zenject 架构下，我们需要将实体（执行者、目标）和服务（时间、日志）注入到节点中，而不是让节点去“拉取”全局状态。
3. **动态构建**：行为树通常是数据驱动的（从配置加载），但其实例化过程需要动态注入运行时的 Context（上下文）。

## 之前的逻辑 (Previous Logic)

在引入 Zenject 和双世界架构之前，常见的做法是：

- 动作节点直接访问 `GameManager.Instance` 或 `RoomManager.Shared` 来查找实体。
- 行为树的更新（Tick）依赖于 MonoBehaviour 的 `Update`，往往难以控制执行顺序和频率（Server Tick vs Client Tick）。
- 实例化过程是硬编码的 `new RuntimeTree()`，难以替换数据源或注入模拟的测试对象。

## 为什么违背设计原则 (Why it violated principles)

- **耦合度过高**：节点与具体管理器强耦合，导致代码难以单元测试，也无法复用于不同的场景（如独立服务器）。
- **违反控制反转（IoC）**：节点主动获取依赖，而不是被动接收依赖。
- **状态污染**：如果不小心在 Client 树中访问了 Server 的实体，会导致状态同步错误，破坏“服务器权威”原则。

## 解决方案 (Solution)

我们设计了一套基于 Factory、Strategy 和 Context Object 模式的架构，配合 Zenject 进行依赖管理。

### 1. 核心组件

#### NPRuntimeTreeFactory (工厂)

- **接口**: `INPRuntimeTreeFactory`
- **职责**: 封装复杂的构建流程。它不只是 `new` 一个对象，而是负责组装数据、时钟和上下文。
- **流程**:
    1. 从 `INPRuntimeTreeDataProvider` 获取静态数据（`NP_DataSupportor`）。
    2. 根据 `IsServer` 标志，从 Zenject 容器中选择对应的 `Clock`（通过 `ClockIds.Server/Client` 区分）。
    3. 创建 `NP_RuntimeTree` 实例。
    4. 构建 **NPRuntimeContext**，注入 `Resolver`。
    5. 调用 `tree.OnInitRuntimeTree(...)`，遍历并初始化所有节点，将 Context 注入到动作节点中。

#### INPRuntimeEntityResolver (实体解析策略)

- **职责**: 提供从 ID 查找实体的统一接口。
- **实现**: 默认实现 `NetworkBusRuntimeEntityResolver` 委托给 `INetworkBus`，通过 `GetSpawnedOrNull(netId, isServer)` 查找。
- **优势**: 行为节点不需要知道 `NetworkBus` 或 `RoomManager` 的存在，只需要调用 `Resolve<T>(id)`。

#### NPRuntimeContext (上下文对象)

- **职责**: 携带运行时元数据（`IsServer`、`OwnerId`、`TargetId`）和服务引用（`Resolver`、`Log`）。
- **作用**: 作为参数传递给动作节点。动作节点通过 Context 获取一切所需信息，保持无状态（或仅持有 Context）。

### 2. 协作流程

1. **注入阶段**: 在 `ShowcaseInstaller` 中绑定 `INPRuntimeTreeFactory`、`INPRuntimeTreeDataProvider` 和 `INPRuntimeEntityResolver`。同时绑定双世界的 `Clock`。
2. **请求阶段**: 比如 `Commander` 初始化时，调用 `factory.Create(request)`，传入自己的 ID 和所属世界（Server/Client）。
3. **构建阶段**: Factory 自动拉取数据、匹配 Clock、创建 Context，并组装出一棵完整的、带有依赖注入的行为树。
4. **运行阶段**:
    - `DualWorldSceneManager` 驱动各自的 `Clock`。
    - `Clock` 驱动行为树的 `Tick`。
    - 动作节点执行时，通过 `Context.Resolve<T>(targetId)` 获取目标实体并执行逻辑。

### 3. 代码示例 (概念)

```csharp
// 使用工厂创建
var tree = _factory.Create(new NPRuntimeTreeBuildRequest 
{ 
    RootId = 1001, 
    EntityId = this.NetId, 
    IsServer = true 
});

// 动作节点内部
protected override void OnExecute()
{
    // 不再访问 Singleton，而是通过 Context 解析
    var target = Context.Resolve<BaseCommander>(TargetId);
    if (target != null)
    {
        target.TakeDamage(10);
    }
}
```

这套架构确保了行为树的纯粹性、可测试性以及对双世界架构的完美支持。
