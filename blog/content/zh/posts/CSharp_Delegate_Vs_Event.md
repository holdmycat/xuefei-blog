---
title: "C# 中 Delegate 与 Event 的核心区别"
date: 2026-01-08T20:17:00+08:00
draft: false
tags: ["C#", "Unity", "Architecture", "Interview"]
categories: ["Deep Dive"]
---

# C# 中 Delegate 与 Event 的核心区别

在 C# 开发（特别是 Unity 开发）面试中，"Delegate 和 Event 的区别是什么？" 是一个出现频率极高的问题。很多开发者虽然会用，但往往难以准确描述它们在设计层面的本质差异。

本文将从架构设计的角度，通过类比和代码示例，深入剖析两者的核心区别。

## 1. 核心类比：字段 vs 属性

理解 Delegate 和 Event 区别最直观的方式，是将其类比为 **字段 (Field)** 和 **属性 (Property)** 的关系。

* **Delegate (委托)**：类似于一个类的 **public 字段**。如果你直接公开它，外部代码拥有对它的完全控制权（赋值、清空、调用）。
* **Event (事件)**：类似于一个类的 **public 属性**。它在 Delegate 的基础上加了一层封装保护，限制了外部代码的权限，**只允许“订阅”和“取消订阅”**。

| 特性 | Delegate (作为字段) | Event |
| :--- | :--- | :--- |
| **本质** | 是一种**类型** (Type) 或类的**字段** | 是基于委托的**成员** (Member)，是对委托实例的封装修饰 |
| **外部权限** | **危险**。外部可以使用 `=` (赋值/覆盖) 或 `Invoke()` (直接调用) | **安全**。外部只能使用 `+=` (订阅) 或 `-=` (取消)。**不能直接调用，也不能赋值 null** |
| **触发权** | 任何拿到引用的对象都可以调用它 | **只有定义该事件的类**内部才能触发 (Invoke) |
| **设计模式** |  回调 (Callback) | 发布-订阅 (Publish-Subscribe) |

## 2. 为什么需要 Event？(代码演示)

假设我们需要实现一个简单的“玩家升级”系统。

### 2.1 使用 Delegate (不安全的设计)

如果直接将 `Action` (一种预定义的 Delegate) 声明为 `public`，任何外部代码都可以对其进行破坏性操作。

```csharp
public class Player
{
    // 直接公开 Delegate，相当于公开了一个 public 字段
    public Action OnLevelUp; 

    public void LevelUp()
    {
        // 内部调用，通知监听者
        if (OnLevelUp != null) OnLevelUp();
    }
}

// 外部调用者
public class GameContext
{
    void Test(Player p)
    {
        // 正常订阅
        p.OnLevelUp += PlaySound; 

        // [危险操作 1]：直接赋值 null (清空)
        // 这会把其他所有模块（如 UI、成就系统）的订阅都清除掉！
        p.OnLevelUp = null; 

        // [危险操作 2]：外部伪造事件 (直接 Invoke)
        // 玩家并没有真正升级，但外部强制触发了升级回调，导致逻辑错乱
        p.OnLevelUp.Invoke(); 
    }
}
```

### 2.2 使用 Event (安全的设计)

加上 `event` 关键字后，编译器会自动生成 add 和 remove 方法（类似属性的 get/set），并屏蔽直接访问。

```csharp
public class Player
{
    // 加上 event 关键字，相当于将其封装为属性
    public event Action OnLevelUp; 

    public void LevelUp()
    {
        // 只有在 Player 类内部可以调用 Invoke
        if (OnLevelUp != null) OnLevelUp();
    }
}

// 外部调用者
public class GameContext
{
    void Test(Player p)
    {
        // ✅ 只能使用 += 或 -=
        p.OnLevelUp += PlaySound;
        
        // ❌ [编译错误]：不能直接赋值，防止误清空
        // p.OnLevelUp = null; // Error: The event 'Player.OnLevelUp' can only appear on the left hand side of += or -=

        // ❌ [编译错误]：不能在外部直接调用，防止伪造事件
        // p.OnLevelUp();      // Error
    }
}
```

## 3. 面试加分项：底层实现的差异

如果面试官追问底层实现，可以补充以下两点：

1. **IL 代码生成**：
    * `public Action MyDelegate;` 在 IL 中就是一个普通的字段。
    * `public event Action MyEvent;` 编译器会生成一个私有的委托字段，以及两个公共方法 `add_MyEvent` 和 `remove_MyEvent`。这与 Property 生成 `get_MyProp` 和 `set_MyProp` 的机制几乎一致。

2. **接口兼容性**：
    * **Interface 可以包含 Event，但不能包含 Field**。这也是为什么我们在定义接口契约时，必须使用 Event 来定义回调。

    ```csharp
    public interface IPlayer
    {
        // ✅ 合法
        event Action OnLevelUp;
        
        // ❌ 非法：接口不能包含字段
        // Action OnLevelUpDelegate; 
    }
    ```

## 4. 总结

在架构设计中，**封装 (Encapsulation)** 是核心原则之一。

* 当你只想传递一个简单的回调函数给方法作为参数时（例如 `List.Sort`），使用 **Delegate**。
* 当你设计一个类，需要向外部通知状态变化，且不希望外部干预通知过程时，**必须使用 Event**。它保护了调用的安全性，强制实现了“发布者负责触发，订阅者负责监听”的职责分离。
