---
title: "Factory Pattern Comparison: Wrapper Factory vs Virtual Method (Zenject)"
date: 2025-12-27T10:56:52+0800
draft: false
tags: ["Architecture", "Zenject", "Unity", "Design Patterns"]
---

# 1. Background

When refactoring the Numeric System for SLG Battle Entities (`SlgBattleEntity`), we faced a challenge: **How to create specific Numeric Components (e.g., `CommanderNumericComponent`, `LegionNumericComponent`) for different entities while keeping the code decoupled and the Dependency Injection (DI) clean.**

Specific Requirements:

1. Different entities need to create different types of components.
2. Component creation may require different parameters (e.g., `IsServer` flag).
3. We must adhere to Zenject's DI principles and avoid the Service Locator pattern.

> **Note: What is the Service Locator Pattern?**
>
> Service Locator is considered an **Anti-Pattern** in modern Dependency Injection. It allows classes to actively "pull" dependencies via a global static access point (e.g., `Container.Resolve<T>()` or `Context.Instance`), rather than declaring them in the constructor.
>
> * **The Problem**: It hides a class's true dependencies (the constructor doesn't show what it needs), making code hard to test (you must mock the entire global container) and prone to runtime NullReferenceExceptions.
> * **The DI Way**: **Explicit Injection**. A class explicitly declares what it needs (e.g., `public Class(IFactory factory)`), and the container pushes those dependencies in. This makes dependencies transparent and unit testing trivial.

# 2. Solution Comparison

We considered two main design approaches:

## Option A: Wrapper Factory (Current Solution)

Create a unified factory class `NumericComponentFactory` that wraps all concrete Zenject Placeholder Factories.

```csharp
public class NumericComponentFactory
{
    private readonly CommanderNumericComponent.Factory _commanderFactory;
    private readonly LegionNumericComponent.Factory _legionFactory;

    // Inject all sub-factories centrally
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

## Option B: Virtual Factory Method (Polymorphism)

Define an abstract method in the base class `SlgBattleEntity` and let subclasses implement their own creation logic.

```csharp
public abstract class SlgBattleEntity : NetworkBehaviour
{
    protected abstract void CreateNumericComponent();
}

public class ServerCommander : SlgBattleEntity
{
    [Inject] CommanderNumericComponent.Factory _myFactory; // Inject its own factory

    protected override void CreateNumericComponent() 
    {
         _numericComponent = _myFactory.Create(true);
    }
}
```

# 3. Deep Analysis

## 3.1 Coupling & Dependency Injection (DI)

* **Wrapper Factory**:
  * **Pros**: Entity dependencies are very clean. `ServerCommander` only needs to depend on one `NumericComponentFactory`.
  * **Pros**: Centralizes the knowledge of "what to create".
  * **Cons**: Violates the Open/Closed Principle (OCP). Adding a new entity type requires modifying the `NumericComponentFactory` class to add methods like `CreateTower`, `CreateSoldier`.

* **Virtual Method**:
  * **Pros**: Fully adheres to OCP. When adding a `Tower` entity, you only modify the `Tower` class, touching no existing factory code.
  * **Cons**: **Dependency Explosion**. Every entity subclass needs to declare dependency on its specific Factory in its constructor or injection method. This adds significant boilerplate code to every Entity.

## 3.2 Encapsulation

* **Wrapper Factory**:
  * Hides specific Zenject `PlaceholderFactory` details. Consumers just call `CreateCommander()` without worrying about instantiation logic.
  * Acts as a unified API entry point.

* **Virtual Method**:
  * Delegates creation logic to subclasses. While natural in OO, in a DI framework, this exposes specific factory dependencies to subclasses.

# 4. Conclusion & Recommendation

**Recommendation: Keep the Current Solution (Wrapper Factory)**

## Reasons

1. **DI Friendliness**: In a Zenject environment, minimizing dependency declarations in business classes (Entities) is key to readability. Wrapper Factory consolidates complex factory dependencies into one class, keeping Entities clean.
2. **Maintenance Cost**: Although it violates OCP, in an SLG project, core entity types (Commander, Legion, Squad) are relatively stable. The cost of modifying the factory is far lower than maintaining injection code across dozens of Entity subclasses.
3. **Context Isolation**: As seen in our recent refactoring, factories may need to handle cross-Context (SubContainer) parameter passing. The Wrapper Factory provides an excellent intermediate layer to handle these conversions (e.g., `bool isServer`), relieving the Entity from this burden.

Therefore, the **Facade (Wrapper) pattern often provides a better engineering experience than pure Polymorphism (Virtual Method) when combined with DI frameworks.**
