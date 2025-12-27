---
title: "Zenject Best Practices: Reject DiContainer, Embrace Factory"
date: 2025-12-27T09:05:00+08:00
draft: false
tags: ["Architecture", "Zenject", "Unity", "Design Patterns"]
---

# Zenject Factory Patterns: DiContainer vs IInstantiator vs PlaceholderFactory

## 1. Problem Context

When building `NumericComponentFactory`, we needed to dynamically create runtime components (e.g., `CommanderNumericComponent`). The most direct approach is to inject `DiContainer` and call `Instantiate`, but this introduces significant design flaws.

## 2. Previous Logic & The Anti-Pattern

The initial implementation injected `DiContainer` directly into the factory class:

```csharp
public class NumericComponentFactory
{
    [Inject] private DiContainer _container; // ❌ Too much privilege
    
    public T Create<T>() { return _container.Instantiate<T>(); }
}
```

### Why it Violated Design Principles

1. **Service Locator Pattern**: Injecting `DiContainer` turns the class into a Service Locator. It can access *any* service in the container, hiding the true dependencies of the class and making it hard to test and maintain.
2. **Principle of Least Privilege**: A factory only needs the permission to "create" objects. `DiContainer` grants permissions to "Bind", "Unbind", and "Resolve" any object, which is excessive.
3. **Type Unsafe**: `_container.Instantiate<T>()` cannot guarantee at compile time that `T` has been properly bound or configured.

## 3. Solution A: IInstantiator (Better)

`IInstantiator` is a subset interface of `DiContainer`, specifically responsible for object construction.

```csharp
public class NumericComponentFactory
{
    private readonly IInstantiator _instantiator; // ✅ Only instantiation privilege

    public NumericComponentFactory(IInstantiator instantiator)
    {
        _instantiator = instantiator;
    }

    public T Create<T>() { return _instantiator.Instantiate<T>(); }
}
```

* **Pros**: Removes `Bind/Resolve` permissions, adhering to the Interface Segregation Principle (ISP).
* **Cons**: It is still a "generic" creator. If the factory only needs to create 3 specific types of components, granting it the ability to create "any object" is still too broad.

## 4. Solution B: PlaceholderFactory (Best Practice)

Zenject provides `PlaceholderFactory<T>`, a strongly-typed factory wrapper.

```csharp
// 1. Define Concrete Factory
public class CommanderNumericComponent : BaseNumericComponent
{
    public class Factory : PlaceholderFactory<CommanderNumericComponent> { }
}

// 2. Inject Concrete Factory
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

### Why it is Best Practice

1. **Explicit Dependencies**: Through the constructor, it is immediately clear that `NumericComponentFactory` relies on the ability to create three specific components.
2. **Type Safety**: The compiler ensures `Create()` returns the correct type.
3. **Encapsulation**: `NumericComponentFactory` cannot create anything other than these three components.
4. **Testability**: In unit tests, `CommanderNumericComponent.Factory` can be easily mocked, whereas mocking `DiContainer` or `IInstantiator` is complex.

## 5. Conclusion

In our refactor, we chose **Solution B (PlaceholderFactory)**. Although it requires defining nested classes (`public class Factory : ...`) and binding them in the Installer (`Container.BindFactory<...>`), the resulting architectural clarity and type safety are well worth the effort.
