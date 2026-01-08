---
title: "C# Delegate & Closure Allocations Deep Dive"
date: 2026-01-08T08:25:00+08:00
draft: false
tags: ["C#", "Performance", "Unity"]
---

# C# Delegate & Closure Allocations Deep Dive

In high-performance C# development (like Unity game development), the use of Delegates is ubiquitous. However, different invocation methods can lead to drastically different Memory Allocation and GC behavior. This article compares three common patterns: Direct Invoke, Lambda Wrapping, and Method Group Wrapping.

## Problem Background

In code reviews, we often see the following coding styles:

```csharp
// Option 1: Direct Invoke
Action?.Invoke();

// Option 2: Lambda Wrapping
new Action(() => {
    if (!ShouldExecute()) return;
    this.Func1();
});

// Option 3: Method Group Wrapping
new Action(ExecuteFunc2Wrapper);
```

Developers often ask: **What are the differences in memory, performance, and GC among these three approaches?** Especially when passing them to third-party libraries or underlying systems via `new Action(...)`.

## Detailed Comparison

| Feature | Option 1: Action?.Invoke() | Option 2: new Action(() => { ... }) | Option 3: new Action(MethodGroup) |
| :--- | :--- | :--- | :--- |
| **Allocation** | **0** (No new object) | **At least 1 Delegate Object** + **Potential Closure Object** | **1 Delegate Object** (No closure) |
| **Performance** | **Fastest** (Direct IL Call) | **Slightly Slower** (Delegate call + Closure access overhead) | **Medium** (Close to Lambda, no closure overhead) |
| **GC Pressure** | **None** | **High** (If called frequently, generates garbage) | **Medium** (Less than Lambda, but still has delegate allocation) |
| **Flexibility** | Low (Call in place only) | High (Can encapsulate logic, capture variables) | Medium (Requires extra method definition, no closure) |

### 1. Action?.Invoke() (Direct Call)

- **Mechanism**: Directly executes the method pointed to by the delegate, without creating a new delegate instance.
- **Pros**: Zero allocation, highest performance.
- **Cons**: Cannot encapsulate extra logic (e.g., filtering conditions like `if (!ShouldExecute())`), nor can it be delayed (unless it is already stored).
- **Use Case**: Event triggering, direct calls where a delegate reference is already held.

### 2. new Action(() => { ... }) (Lambda Wrapping)

- **Mechanism**: The compiler generates a new class for the Lambda expression (if it captures local variables) or uses `this` (if it accesses members).
  - **Closure Trap**: If the Lambda captures external variables (even just `this`), the compiler must instantiate a closure object to hold these variables, **and then** instantiate a delegate pointing to a method on this closure object.
- **Allocation**: `Delegate Object` + `Closure Object` (if capturing).
- **Use Case**: Quick prototyping, non-hot paths, asynchronous callbacks that must capture context.

### 3. new Action(ExecuteFunc2Wrapper) (Method Group Wrapping)

- **Mechanism**: Creates a delegate pointing to a specific method.
- **Allocation**: **Only 1 Delegate Object**. Since the method is a class member, no extra closure object is needed to hold state (`this` is already the target).
- **Pros**: One less object allocation compared to Lambda (skips the closure class).
- **Cons**: Requires defining an extra wrapper method, less compact than Lambda.
- **Recommendation**: A great compromise when you need to encapsulate logic (e.g., to adapt to an interface) but want to reduce GC.

## Scenario Analysis: Task or Action Encapsulation

If you are building a task system, for example:

```csharp
public void AddTask(Action action) {
    _tasks.Add(new Task(action)); // Assuming Task holds the action internally
}
```

When you call `AddTask`:

- **Option 1 N/A**: Because you need to pass an object in, not execute it immediately.
- **Option 2 (`() => ...`)**: Creates 1 delegate + 1 closure (if capturing `this`). Total = 2 allocs.
- **Option 3 (`MethodGroup`)**: Creates 1 delegate. Total = 1 alloc.

**Conclusion**: In efficient paths (Hot Path) or per-frame logic, **Option 3 is superior to Option 2**.

## Summary & Recommendations

1. **Invoke if you can**: Don't wrap without a reason.
2. **Beware of Lambda Closures**: Avoid capturing Lambdas in Update loops or frequently fired events.
3. **Method Groups are the Cure**: If you are wrapping simple function calls with Lambdas just for "cleanliness", switch to Method Groups or define private helper methods to save closure allocations.
4. **Cache Delegates**: If a delegate is reused and the logic is static, cache it as a static field or member variable to reduce allocation to **0** (after initialization).

```csharp
// Best Optimization: Cached Delegate
private Action _cachedAction;

public void Init() {
    _cachedAction = ExecuteFunc2Wrapper;
}

public void Update() {
    // 0 Allocation here!
    Execute(_cachedAction);
}
```
