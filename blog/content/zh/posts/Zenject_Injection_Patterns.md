---
title: "Zenject 注入模式详解：构造函数注入 vs 方法注入"
date: 2025-12-27T15:45:56+0800
draft: false
tags: ["Architecture", "Zenject", "Unity", "Dependency Injection"]
---

# 1. 问题背景 (Background)

在使用 Zenject 进行依赖注入时，开发者经常困惑于何时使用 **Constructor Injection**（构造函数注入），何时使用 **Method Injection**（方法注入，通常命名为 `Construct`）。

特别是在处理 `Manager` 类时，如果它是纯 C# 类，或者是继承自 `MonoBehaviour` 的组件，注入方式截然不同。混淆两者会导致 Unity 报错（如 "MonoBehaviour cannot have constructor"）或设计上的不严谨。

# 2. 核心原则 (Core Principle)

一句话原则：**能用构造函数注入，就绝不用其他方式；除非是 Unity 组件 (MonoBehaviour)，被迫使用方法注入。**

## 2.1 构造函数注入 (Constructor Injection)

**适用对象**：纯 C# 类 (Pure C# Classes)，不继承 `MonoBehaviour` 的类。

* **写法**：

    ```csharp
    public class ServerManager 
    {
        private readonly ServerRoomManager _roomManager;

        // 强迫调用者（容器）在创建对象时必须提供所有依赖
        public ServerManager(ServerRoomManager roomManager) 
        {
            _roomManager = roomManager;
        }
    }
    ```

* **优点**：
  * **原子性**：对象一旦创建，就是“完全体”，不存在“半初始化”状态。
  * **不变性 (Immutability)**：依赖字段可以用 `readonly` 修饰，保证整个生命周期内不会被意外修改。
  * **易测试**：单元测试时，可以直接 `new ServerManager(mockRoom)`，无需反射或 Mock 容器。

## 2.2 方法注入 (Method Injection)

**适用对象**：`MonoBehaviour` 子类。

* **写法**：

    ```csharp
    public class ClientManager : MonoBehaviour 
    {
        private ClientRoomManager _roomManager;

        // Unity 先实例化对象(Awake)，Zenject 再调用此方法注入依赖
        [Inject]
        public void Construct(ClientRoomManager roomManager) 
        {
            _roomManager = roomManager;
        }
    }
    ```

* **原因**：Unity 的 `MonoBehaviour` 是由引擎底层（C++端）负责实例化的。我们不能写 `new ClientManager(...)`，因此无法通过构造函数传参。Zenject 只能监听对象的创建（通过 `GameObjectContext` 或 `ProjectContext`），在对象 `Awake` 之后，反射调用标记了 `[Inject]` 的方法来“后置填充”依赖。

# 3. 错误示范 (Anti-Patterns)

## 3.1 在 MonoBehaviour 中写构造函数

```csharp
public class MyComponent : MonoBehaviour 
{
    // ❌ 错误：Unity 会警告 "You are trying to create a MonoBehaviour using the 'new' keyword."
    public MyComponent(Dependency dep) { ... } 
}
```

## 3.2 在纯类中使用方法注入（非必须）

```csharp
public class MyService 
{
    // ⚠️ 不推荐：明明可以用构造函数，却用了方法注入
    // 导致这个类可以被无参构造 `new MyService()`，变成一个“空壳”，容易引发 NullReferenceException
    [Inject]
    public void Init(Dependency dep) { ... }
}
```

## 3.3 字段注入 (Field Injection)

```csharp
public class MyService 
{
    // ⚠️ 不推荐 (除非是私有变量且极懒)
    // 缺点：隐藏了依赖关系，外部不知道这个类依赖什么；且由于是私有，单元测试极难赋值。
    [Inject] private Dependency _dep; 
}
```

# 4. 最佳实践总结

| 类类型 (Class Type) | 推荐注入方式 | 理由 |
| :--- | :--- | :--- |
| **Pure C# Class** | **Constructor Injection** | 保证完整性，支持 `readonly`，易测试 |
| **MonoBehaviour** | **Method Injection (`Construct`)** | 适应 Unity 生命周期 |
| **ScriptableObject** | **Method Injection** | 同样由 Unity 实例化，无法使用构造函数 |

在重构 `ShowcaseSceneManager` 时：

* `ShowcaseSceneServerManager` 是纯逻辑类 -> **构造函数注入**。
* `ShowcaseSceneClientManager` 是表现层组件 -> **方法注入**。
