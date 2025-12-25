---
title: "Commander & Unit Hierarchy Architecture"
date: 2025-12-25
tags: ["Architecture", "System Design", "Zenject"]
draft: false
---

# Commander & Unit Hierarchy Architecture

## 1. 背景 (Context)

在大型 SLG 战斗系统中，单位呈现出严格的层级关系：**指挥官 (Commander) -> 军团 (Legion) -> 方阵 (Phalanx) -> 士兵 (Soldier)**。
目前的工程 (`Modular-Skill-System-Demo`) 中，`Commander` 已经被实现为网络同步的核心实体，利用 Zenject 进行依赖注入和生命周期管理。
为了扩展到海量单位的千人同屏战斗，我们需要明确这四层架构如何映射到 Zenject 的 `Factory` 模式以及 `DataCtrl` 数据流中。

## 2. 架构决策 (Decision)

采用 **嵌套工厂模式 (Nested Factory Pattern)** 结合 **数据驱动 (Data-Driven)** 的方式构建层级。

### 2.1 核心设计映射

| 概念                  | 对应类/接口 (现有/提议)                        | 职责                     | Zenject 模式                        |
| :------------------ | :------------------------------------ | :--------------------- | :-------------------------------- |
| **指挥官 (Commander)** | `ServerCommander` / `ClientCommander` | 玩家代理，持有全局技能，管理辖下军团。    | `BindFactory<Commander, Factory>` |
| **军团 (Legion)**     | `LegionController` (提议)               | 战术单元，包含多个方阵，负责寻路宏指令。   | `BindFactory<Legion, Factory>`    |
| **方阵 (Phalanx)**    | `PhalanxController` (提议)              | 阵型单元，保持队形，管理士兵的局部状态。   | `BindFactory<Phalanx, Factory>`   |
| **士兵 (Soldier)**    | `SoldierEntity` (提议)                  | 最小渲染/逻辑单元，执行具体动画和伤害判定。 | `MemoryPool` (性能敏感)               |

### 2.2 Zenject 工厂级联

目前的 `GameInstaller` 和 `ShowcaseInstaller` 已经展示了顶层的注入模式：

```csharp
// ShowcaseInstaller.cs
Container.BindFactory<ServerCommander, ServerCommander.Factory>().AsSingle();
Container.BindFactory<ClientCommander, ClientCommander.Factory>().AsSingle();
```

未来的层级扩展将遵循**父级持有子级工厂**的原则：

1. **Commander** 注入 `Legion.Factory`。
2. **Legion** 注入 `Phalanx.Factory`。
3. **Phalanx** 注入 `Soldier.Pool` (因为士兵数量巨大，使用对象池优于普通工厂)。

## 3. 概念辨析 (Concept Clarification)

为了消除歧义，以下详细定义了 **嵌套工厂模式** 和 **数据驱动** 在本项目中的具体含义及代码实现。

### 3.1 嵌套工厂模式 (Nested Factory Pattern)

**定义**：
指一种**父级对象持有子级对象工厂**的依赖注入模式。与其相反的是“上帝工厂”(God Factory)，即一个全局管理器负责生产所有层级的对象。

**代码体现**：
并不是指 Zenject 的 `Container.BindFactory` 语法本身，而是指**谁在使用这个 Factory**。

* **错误理解**：仅仅是在 Installer 里 Bind 了 Factory。
* **正确理解**：`ServerCommander` 类内部被注入了 `ServerLegion.Factory`，由 Commander 自行决定何时创建 Legion。

**示例代码**：

```csharp
// 1. 父级 (Parent)
public class ServerCommander : BaseCommander 
{
    private readonly ServerLegion.Factory _legionFactory; // <--- 持有子工厂

    [Inject]
    public ServerCommander(ServerLegion.Factory factory) // <--- 依赖注入
    {
        _factory = factory;
    }

    public void SpawnLegion() 
    {
        // 2. 由父级决定创建，并传递上下文
        var legion = _legionFactory.Create(); 
        // ... 初始化 legion ...
    }
}
```

**设计意图**：
这种模式确保了**封装性**。外界（如 `GameManager`）不需要知道 `Legion` 的存在，只需要通知 `Commander` "开始战斗"，Commander 会自行利用手中的工厂构建下属部队。

### 3.2 数据驱动 (Data-Driven)

**定义**：
指**运行逻辑 (Runtime Logic)** 与 **数据定义 (Data Definition)** 的完全分离。
在本项目中，"数据"的具体载体包含：

1. **静态配置**: `ScriptableObject` (如 `LegionConfig`) 或 `DataGraph` (节点图)。
2. **动态载荷**: `SpawnPayload` (二进制/BSON)，用于网络传输。

**代码体现**：
工厂创建对象时（如 `Create()`），往往是不带参数或仅带通用参数的。对象创建后，必须通过 `Configure(data)` 或 `InitFromPayload(payload)` 来通过数据驱动其行为。

**流程示例**：

1. **Data**: 策划配置 `LegionConfig_A` (包含 3 个弓箭手方阵)。
2. **Logic**: 代码中只有通用的 `LegionController` 类。
3. **Drive**:
    * Factory 创建空白的 `LegionController`。
    * 调用 `Configure(LegionConfig_A)`。
    * `LegionController` 读取配置，发现需要生成 3 个方阵，于是循环调用 3 次 `PhalanxFactory.Create()`。

## 4. 细节与示例 (Details)

### 4.1 现有实现：Commander

`ClientCommander` 目前通过 `ClientRoomManager` 创建，其依赖关系 (`IDataLoaderService`) 由 Zenject 自动注入。这确保了无论 Commander 何时出生，都能获取到最新的全局服务。

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

### 4.2 提议实现：兵海层级

为了处理成千上万的士兵，低层级对象 (Soldier) 不应作为独立的 `GameObjects` 绑定到 Zenject 容器深处，而是应该使用轻量级的 **Zenject Memory Pool**。

```csharp
// 伪代码示例
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

## 5. 总结 (Summary)

* **Commander** 是双端架构的锚点，利用 Zenject Factory 保证了网络同步 ID (`NetId`) 和依赖注入的正确初始化。
* **Legion/Phalanx** 将作为中间层，继续沿用工厂模式进行逻辑封装。
* **Soldier** 作为海量实体，架构上从“依赖注入”转向“内存池管理”，以换取渲染性能。
* 这种分层设计完美契合 SLG 的 "LOD" (Level of Detail) 逻辑——指挥官关心战术(Legion)，方阵关心阵型(Phalanx)，只有底层渲染关心士兵(Soldier)。
