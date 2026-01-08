---
title: "Core Difference between Delegate and Event in C#"
date: 2026-01-08T20:17:00+08:00
draft: false
tags: ["C#", "Unity", "Architecture", "Interview"]
categories: ["Deep Dive"]
---

# Core Difference between Delegate and Event in C #

In C# development (especially Unity development) interviews, "What is the difference between Delegate and Event?" is a very frequent question. Many developers use them daily but often struggle to accurately describe their essential differences at the design level.

This article analyzes the core differences from an architectural perspective, using analogies and code examples.

## 1. Core Analogy: Field vs. Property

The most intuitive way to understand the difference between Delegate and Event is to liken them to the relationship between **Field** and **Property**.

* **Delegate**: Similar to a **public field** of a class. If you expose it directly, external code has full control over it (assign, clear, invoke).
* **Event**: Similar to a **public property** of a class. It adds a layer of encapsulation protection on top of the Delegate, restricting external access. **It only allows "subscribe" and "unsubscribe".**

| Feature | Delegate (as Field) | Event |
| :--- | :--- | :--- |
| **Essence** | A **Type** or a class **Field** | A **Member** based on a delegate, representing encapsulation of a delegate instance |
| **External Rights** | **Dangerous**. External code can use `=` (assign/overwrite) or `Invoke()` (call directly) | **Safe**. External code can only use `+=` (subscribe) or `-=` (unsubscribe). **Cannot call directly, nor assign null.** |
| **Trigger Rights** | Any object holding the reference can call it | **Only the class defining the event** can trigger (Invoke) it internals |
| **Design Pattern** | Callback | Publish-Subscribe |

## 2. Why Do We Need Events? (Code Demo)

Suppose we need to implement a simple "Player Level Up" system.

### 2.1 Using Delegate (Unsafe Design)

If you declare `Action` (a predefined Delegate) as `public`, any external code can perform destructive operations on it.

```csharp
public class Player
{
    // Exposing Delegate directly is like exposing a public field
    public Action OnLevelUp; 

    public void LevelUp()
    {
        // Internal call, notify listeners
        if (OnLevelUp != null) OnLevelUp();
    }
}

// External caller
public class GameContext
{
    void Test(Player p)
    {
        // Normal subscription
        p.OnLevelUp += PlaySound; 

        // [Dangerous Operation 1]: Assigning null directly (Clearing)
        // This clears subscriptions from all other modules (UI, Achievements, etc.)!
        p.OnLevelUp = null; 

        // [Dangerous Operation 2]: External fake event (Direct Invoke)
        // The player didn't actually level up, but external code forced the callback, causing logic errors
        p.OnLevelUp.Invoke(); 
    }
}
```

### 2.2 Using Event (Safe Design)

By adding the `event` keyword, the compiler automatically generates add and remove methods (similar to property get/set) and blocks direct access.

```csharp
public class Player
{
    // Adding the event keyword is like encapsulating it as a property
    public event Action OnLevelUp; 

    public void LevelUp()
    {
        // Only the Player class itself can call Invoke
        if (OnLevelUp != null) OnLevelUp();
    }
}

// External caller
public class GameContext
{
    void Test(Player p)
    {
        // ✅ Can only use += or -=
        p.OnLevelUp += PlaySound;
        
        // ❌ [Compiler Error]: Cannot assign directly, prevents accidental clearing
        // p.OnLevelUp = null; // Error: The event 'Player.OnLevelUp' can only appear on the left hand side of += or -=

        // ❌ [Compiler Error]: Cannot call directly from outside, prevents fake events
        // p.OnLevelUp();      // Error
    }
}
```

## 3. Interview Bonus: Underlying Implementation Differences

If the interviewer asks about the underlying implementation, you can add these two points:

1. **IL Code Generation**:
    * `public Action MyDelegate;` is just a normal field in IL.
    * `public event Action MyEvent;` causes the compiler to generate a private delegate field, plus two public methods `add_MyEvent` and `remove_MyEvent`. This is almost identical to the mechanism where Property generates `get_MyProp` and `set_MyProp`.

2. **Interface Compatibility**:
    * **Interfaces can contain Events, but cannot contain Fields**. This is why we must use Events to define callbacks when defining interface contracts.

    ```csharp
    public interface IPlayer
    {
        // ✅ Legal
        event Action OnLevelUp;
        
        // ❌ Illegal: Interfaces cannot contain fields
        // Action OnLevelUpDelegate; 
    }
    ```

## 4. Summary

In architectural design, **Encapsulation** is one of the core principles.

* When you just want to pass a simple callback function to a method as a parameter (e.g., `List.Sort`), use **Delegate**.
* When you are designing a class that needs to notify the outside world of state changes, and you don't want the outside world to interfere with the notification process, **you must use Event**. It protects the safety of the call, enforcing the separation of concerns where "the publisher is responsible for triggering, and the subscriber is responsible for listening."
