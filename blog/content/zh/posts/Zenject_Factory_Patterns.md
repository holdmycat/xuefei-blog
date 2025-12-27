---
title: "Zenject 最佳实践：拒绝 DiContainer，拥抱 Factory"
date: 2025-12-27T09:05:00+08:00
draft: false
tags: ["Architecture", "Zenject", "Unity", "Design Patterns"]
---

# Zenject 工厂模式对比：DiContainer vs IInstantiator vs PlaceholderFactory

## 1. 问题背景 (Problem)

在构建 `NumericComponentFactory` 时，我们需要动态创建运行时组件（如 `CommanderNumericComponent`）。最直接的方法是注入 `DiContainer` 并调用 `Instantiate`，但这引入了严重的设计隐患。

## 2. 之前的逻辑与问题 (The Anti-Pattern)

最初的实现方式是将 `DiContainer` 注入到工厂类中：

```csharp
public class NumericComponentFactory
{
    [Inject] private DiContainer _container; // ❌ 权限过大
    
    public T Create<T>() { return _container.Instantiate<T>(); }
}
```

### 为什么违背设计原则？

1. **Service Locator (服务定位器模式)**: 注入 `DiContainer` 使得该类可以访问整个容器中的所有服务，这就变成了一个 Service Locator。它隐藏了类的真实依赖关系，使得代码难以测试和维护。
2. **权限过大 (Principle of Least Privilege)**: 工厂只需要"创建"对象的权限，但 `DiContainer` 赋予了它"绑定"、"解绑"、"获取任意对象"的权限。
3. **类型不安全**: `_container.Instantiate<T>()` 在编译时无法保证 `T` 已经被正确绑定或配置。

## 3. 解决方案 A: IInstantiator (Better)

`IInstantiator` 是 `DiContainer` 的一个子集接口，专门负责对象的构造。

```csharp
public class NumericComponentFactory
{
    private readonly IInstantiator _instantiator; // ✅ 仅包含实例化权限

    public NumericComponentFactory(IInstantiator instantiator)
    {
        _instantiator = instantiator;
    }

    public T Create<T>() { return _instantiator.Instantiate<T>(); }
}
```

* **优点**: 移除了 `Bind/Resolve` 权限，遵守了接口隔离原则 (ISP)。
* **缺点**: 依然是一个"通用的"创建器。如果工厂只需要创建 3 种特定的组件，赋予它创建"任意对象"的能力依然显得宽泛。

## 4. 解决方案 B: PlaceholderFactory (Best Practice)

Zenject 提供了 `PlaceholderFactory<T>`，这是一个强类型的工厂包装器。

```csharp
// 1. 定义具体工厂
public class CommanderNumericComponent : BaseNumericComponent
{
    public class Factory : PlaceholderFactory<CommanderNumericComponent> { }
}

// 2. 注入具体工厂
public class NumericComponentFactory
{
    private readonly CommanderNumericComponent.Factory _cmdrFactory;

    public NumericComponentFactory(CommanderNumericComponent.Factory cmdrFactory)
    {
        _cmdrFactory = cmdrFactory;
    }

    public CommanderNumericComponent CreateCommander() => _cmdrFactory.Create();
}
```

### 为什么它是最佳实践？

1. **显式依赖 (Explicit Dependencies)**: 通过构造函数，可以清楚地看到 `NumericComponentFactory` 依赖于三种特定的组件创建能力。
2. **类型安全**: 编译器保证 `Create()` 返回正确的类型。
3. **封装性**: `NumericComponentFactory` 无法创建除这三种组件以外的任何东西。
4. **测试友好**: 在单元测试中，可以轻松 Mock `CommanderNumericComponent.Factory`，而 Mock `DiContainer` 或 `IInstantiator` 则非常复杂。

## 5. 结论

在重构中，我们选择了 **解决方案 B (PlaceholderFactory)**。虽然需要多定义几个嵌套类 (`public class Factory : ...`) 并在 Installer 中绑定 (`Container.BindFactory<...>`)，但它带来的架构清晰度和类型安全性是值得的。
