---
title: "Zenject Injection Patterns: Constructor vs Method Injection"
date: 2025-12-27T15:45:56+0800
draft: false
tags: ["Architecture", "Zenject", "Unity", "Dependency Injection"]
---

# 1. Background

When using Zenject for Dependency Injection, developers are often confused about when to use **Constructor Injection** and when to use **Method Injection** (often named `Construct`).

Confusion arises particularly when dealing with `Manager` classes. Depending on whether it is a Pure C# Class or a `MonoBehaviour`, the injection method differs significantly. Mixing them up leads to Unity errors (e.g., "MonoBehaviour cannot have constructor") or poor design.

# 2. Core Principle

**Principle**: **Always use Constructor Injection if possible. Use Method Injection only if you are forced to (i.e., for MonoBehaviours).**

## 2.1 Constructor Injection

**Target**: Pure C# Classes (Not inheriting from `MonoBehaviour`).

* **Syntax**:

    ```csharp
    public class ServerManager 
    {
        private readonly ServerRoomManager _roomManager;

        // Forces the caller (Container) to provide all dependencies at creation time
        public ServerManager(ServerRoomManager roomManager) 
        {
            _roomManager = roomManager;
        }
    }
    ```

* **Pros**:
  * **Atomicity**: The object is fully initialized upon creation. No "half-initialized" state.
  * **Immutability**: Dependency fields can be `readonly`, ensuring they are never modified.
  * **Testability**: In Unit Tests, you can simply `new ServerManager(mockRoom)` without reflection or Mock Containers.

## 2.2 Method Injection

**Target**: Subclasses of `MonoBehaviour`.

* **Syntax**:

    ```csharp
    public class ClientManager : MonoBehaviour 
    {
        private ClientRoomManager _roomManager;

        // Unity instantiates the object first (Awake), then Zenject calls this method to inject dependencies
        [Inject]
        public void Construct(ClientRoomManager roomManager) 
        {
            _roomManager = roomManager;
        }
    }
    ```

* **Reason**: Unity `MonoBehaviour`s are instantiated by the engine (C++ side). We cannot call `new ClientManager(...)`. Zenject hooks into the creation process (via `GameObjectContext` or `ProjectContext`) and calls the `[Inject]` method via reflection *after* `Awake` to populate dependencies.

# 3. Anti-Patterns

## 3.1 Constructors in MonoBehaviour

```csharp
public class MyComponent : MonoBehaviour 
{
    // ❌ Error: Unity will warn "You are trying to create a MonoBehaviour using the 'new' keyword."
    public MyComponent(Dependency dep) { ... } 
}
```

## 3.2 Method Injection in Pure Classes (Unnecessary)

```csharp
public class MyService 
{
    // ⚠️ Not Recommended: You could have used a constructor.
    // Result: This class can be instantiated as `new MyService()` with null dependencies, leading to runtime errors.
    [Inject]
    public void Init(Dependency dep) { ... }
}
```

## 3.3 Field Injection

```csharp
public class MyService 
{
    // ⚠️ Not Recommended (Lazy)
    // Cons: Hides dependencies (constructor signature is empty). Private fields are hard to set in Unit Tests.
    [Inject] private Dependency _dep; 
}
```

# 4. Best Practices Summary

| Class Type | Recommended Pattern | Reason |
| :--- | :--- | :--- |
| **Pure C# Class** | **Constructor Injection** | Integrity, `readonly` support, Testability |
| **MonoBehaviour** | **Method Injection (`Construct`)** | Adapts to Unity Lifecycle |
| **ScriptableObject** | **Method Injection** | Instantiated by Unity, no constructor control |

In our specific refactoring case:

* `ShowcaseSceneServerManager` (Pure Logic) -> **Constructor Injection**.
* `ShowcaseSceneClientManager` (Presentation) -> **Method Injection**.
