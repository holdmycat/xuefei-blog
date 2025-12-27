---
title: "工厂设计模式对比：Wrapper Factory vs Virtual Method (Zenject)"
date: 2025-12-27T10:56:52+0800
draft: false
tags: ["Architecture", "Zenject", "Unity", "Design Patterns"]
---

# 1. 问题背景 (Background)

在重构 SLG 战斗实体（`SlgBattleEntity`）的数值系统时，我们需要解决的问题是：**如何为不同类型的实体（Commander, Legion, Squad）创建对应的数值组件（NumericComponent），同时保持代码的解耦和依赖注入（DI）的整洁。**

具体需求：

1. 不同的实体需要创建不同类型的组件（如 `CommanderNumericComponent`, `LegionNumericComponent`）。
2. 组件的创建可能需要不同的参数（如 `CommanderBootstrapInfo` 或 `IsServer` 标记）。
3. 我们需要符合 Zenject 的依赖注入原则，避免 Service Locator 模式。

> **补充：什么是 Service Locator 模式？**
>
> Service Locator (服务定位器) 是一种反模式 (Anti-Pattern)。它允许类通过一个全局静态访问点（如 `Container.Resolve<T>()` 或 `Context.Instance`）主动去“拉取”依赖，而不是在构造函数中声明依赖。
>
> * **问题**：它隐藏了类的真实依赖关系（看构造函数看不出它依赖什么），导致代码难以测试（必须模拟整个全局容器）且容易在运行时抛出空引用异常。
> * **DI 的做法**：Explicit Injection (显式注入)。类明确声明自己需要什么（如 `public Class(IFactory factory)`），由容器负责填充。这样做依赖清晰，易于单元测试。

# 2. 方案对比

我们主要考量两种设计方案：

## 方案 A：Wrapper Factory (现有方案)

创建一个统一的工厂类 `NumericComponentFactory`，它包装了所有具体的 Zenject 工厂。

```csharp
public class NumericComponentFactory
{
    private readonly CommanderNumericComponent.Factory _commanderFactory;
    private readonly LegionNumericComponent.Factory _legionFactory;

    // 统一注入所有子工厂
    public NumericComponentFactory(CommanderNumericComponent.Factory commanderFactory, ...)
    {
        _commanderFactory = commanderFactory;
        ...
    }

    public CommanderNumericComponent CreateCommander(bool isServer)
    {
        return _commanderFactory.Create(isServer);
    }
}
```

## 方案 B：Virtual Factory Method (多态工厂方法)

在基类 `SlgBattleEntity` 中定义抽象方法，由子类各自实现创建逻辑。

```csharp
public abstract class SlgBattleEntity : NetworkBehaviour
{
    protected abstract void CreateNumericComponent();
}

public class ServerCommander : SlgBattleEntity
{
    [Inject] CommanderNumericComponent.Factory _myFactory; // 注入自己的工厂

    protected override void CreateNumericComponent() 
    {
         _numericComponent = _myFactory.Create(true);
    }
}
```

# 3. 深度分析

## 3.1 耦合度与依赖管理 (Coupling & DI)

* **Wrapper Factory**:
  * **优点**：实体的依赖非常干净。`ServerCommander` 只需要依赖一个 `NumericComponentFactory`（甚至不需要，如果它被基类统一管理）。
  * **优点**：将“创建什么”的知识集中在一个地方。
  * **缺点**：Factory 类本身违反了开闭原则（OCP）。每增加一种新实体，都需要修改 `NumericComponentFactory` 类来增加 `CreateTower`, `CreateSoldier` 等方法。

* **Virtual Method**:
  * **优点**：完全符合开闭原则。新增 `Tower` 实体时，只需在 `Tower` 类中实现创建逻辑，无需修改任何现有代码。
  * **缺点**：**依赖爆炸**。每个实体子类都需要在自己的构造函数或注入方法中声明对自己所需 Factory 的依赖。这会导致每个 Entity 的头部都有一堆 `[Inject] _factory` 代码，增加了样板代码量。

## 3.2 封装性 (Encapsulation)

* **Wrapper Factory**：
  * 隐藏了 Zenject `PlaceholderFactory` 的细节。使用者只调用 `CreateCommander()`，不需要关心其背后的实例化逻辑。
  * 适合作为对外统一的 API 入口。

* **Virtual Method**：
  * 将创建逻辑下放给子类。这在面向对象设计（OO）中是非常自然的，但在 DI 框架下，意味着子类必须暴露对具体 Factory 的依赖。

# 4. 结论与推荐 (Conclusion)

**推荐维持当前方案：Wrapper Factory (NumericComponentFactory)**

## 理由

1. **DI 友好性**：在 Zenject 环境下，减少业务类（Entity）的依赖声明数量是提升代码可读性的关键。Wrapper Factory 将复杂的工厂依赖收拢到了一个类中，使得 Entity 代码更清爽。
2. **维护成本**：虽然违反了 OCP（新增实体需改工厂），但在 SLG 项目中，核心实体类型（Commander, Legion, Squad）是相对稳定的，不会频繁爆炸式增长。修改工厂的成本远低于在几十个 Entity 子类中维护注入代码的成本。
3. **Context 隔离**：正如我们之前的重构，工厂可能需要处理跨 Context（SubContainer）的参数传递。Wrapper Factory 提供了一个极好的中间层来处理这些参数转换（如 `bool isServer`），而不需要让每个 Entity 去处理。

因此，**Facade (Wrapper) 模式在结合 DI 框架使用时，往往比纯粹的 Polymorphism (Virtual Method) 能带来更好的工程体验。**
