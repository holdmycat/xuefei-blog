---
title: "Commander & Unit Hierarchy Architecture - Zenject Factory Pattern"
date: 2025-12-22
tags: ["Architecture", "Zenject", "SLG", "Unity"]
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

| 概念 | 对应类/接口 (现有/提议) | 职责 | Zenject 模式 |
| :--- | :--- | :--- | :--- |
| **指挥官 (Commander)** | `ServerCommander` / `ClientCommander` | 玩家代理，持有全局技能，管理辖下军团。 | `BindFactory<Commander, Factory>` |
| **军团 (Legion)** | `LegionController` (提议) | 战术单元，包含多个方阵，负责寻路宏指令。 | `BindFactory<Legion, Factory>` |
| **方阵 (Phalanx)** | `PhalanxController` (提议) | 阵型单元，保持队形，管理士兵的局部状态。 | `BindFactory<Phalanx, Factory>` |
| **士兵 (Soldier)** | `SoldierEntity` (提议) | 最小渲染/逻辑单元，执行具体动画和伤害判定。 | `MemoryPool` (性能敏感) |

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

## 3. 细节与示例 (Details)

### 3.1 现有实现：Commander

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

### 3.2 提议实现：兵海层级

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

## 4. 总结 (Summary)

* **Commander** 是双端架构的锚点，利用 Zenject Factory 保证了网络同步 ID (`NetId`) 和依赖注入的正确初始化。
* **Legion/Phalanx** 将作为中间层，继续沿用工厂模式进行逻辑封装。
* **Soldier** 作为海量实体，架构上从“依赖注入”转向“内存池管理”，以换取渲染性能。
* 这种分层设计完美契合 SLG 的 "LOD" (Level of Detail) 逻辑——指挥官关心战术(Legion)，方阵关心阵型(Phalanx)，只有底层渲染关心士兵(Soldier)。
