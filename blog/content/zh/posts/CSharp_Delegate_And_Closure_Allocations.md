---
title: "C# 委托与闭包分配深度剖析"
date: 2026-01-08T08:25:00+08:00
draft: false
tags: ["C#", "Performance", "Unity"]
---

# C# 委托与闭包分配深度剖析 (Delegate & Closure Allocations)

在高性能 C# 开发（如 Unity 游戏开发）中，委托（Delegate）的使用无处不在。然而，不同的调用方式会导致截然不同的内存分配（Allocation）和 GC 行为。本文对比三种常见模式：直接 Invoke、Lambda 包装、方法组包装。

## 问题背景

在代码审查中，我们经常看到如下几种写法：

```csharp
// 方案 1: 直接调用
Action?.Invoke();

// 方案 2: Lambda 包装
new Action(() => {
    if (!ShouldExecute()) return;
    this.Func1();
});

// 方案 3: 方法组包装
new Action(ExecuteFunc2Wrapper);
```

开发者往往关心：**这三种写法在内存、性能和 GC 上有何差异？** 尤其是在通过 `new Action(...)` 传递给第三方库或底层系统时。

## 详细对比

| 特性 | 方案 1: Action?.Invoke() | 方案 2: new Action(() => { ... }) | 方案 3: new Action(MethodGroup) |
| :--- | :--- | :--- | :--- |
| **分配 (Allocation)** | **0** (无新对象) | **至少 1 个委托对象** + **潜在闭包对象** | **1 个委托对象** (无闭包) |
| **性能 (Performance)** | **最快** (直接 IL 调用) | **略慢** (委托调用 + 闭包访问开销) | **中等** (接近 Lambda，无闭包开销) |
| **GC 压力** | **无** | **高** (若频繁调用，产生大量垃圾) | **中** (比 Lambda 少，但仍有委托分配) |
| **灵活性** | 低 (只能原地调用) | 高 (可封装逻辑、捕获变量) | 中 (需定义额外方法，无闭包) |

### 1. Action?.Invoke() (直接调用)

- **机制**：直接执行委托指向的方法，不创建新的委托实例。
- **优点**：零分配，性能最高。
- **缺点**：无法封装额外的逻辑（如过滤条件 `if (!ShouldExecute())`），也不能延迟执行（除非它本身就是被存储的）。
- **场景**：事件触发、由于已经持有委托引用的直接调用。

### 2. new Action(() => { ... }) (Lambda 包装)

- **机制**：编译器会为 Lambda 表达式生成一个新类（如果捕获了局部变量）或者利用 `this`（如果访问了成员）。
  - **闭包陷阱**：如果 Lambda 捕获了外部变量（甚至只是 `this`），编译器必须实例化一个闭包对象来持有这些变量，**然后**再实例化一个委托指向这个闭包对象的方法。
- **分配**：`Delegate Object` + `Closure Object` (如果有捕获)。
- **场景**：快速原型、非热点代码路径、必须捕获上下文的异步回调。

### 3. new Action(ExecuteFunc2Wrapper) (方法组包装)

- **机制**：创建一个指向特定方法的委托。
- **分配**：**仅 1 个委托对象**。因为方法是类成员，不需要额外的闭包对象来持有状态（`this` 已经是现成的目标）。
- **优点**：比 Lambda 少一次对象分配（省去了闭包类）。
- **缺点**：需要额外定义一个包装方法，不如 Lambda 写法紧凑。
- **推荐**：当你需要封装逻辑（比如为了适配接口）但又想减少 GC 时，这是一个很好的折中方案。

## 场景分析：Task 或 Action 封装

如果你正在构建一个任务系统，例如：

```csharp
public void AddTask(Action action) {
    _tasks.Add(new Task(action)); // 假设 Task 内部会持有 action
}
```

当你调用 `AddTask` 时：

- **方案 1 不适用**：因为你需要传递一个对象进去，而不是立即执行。
- **方案 2 (`() => ...`)**：创建 1 个委托 + 1 个闭包（如果捕获 `this`）。Total = 2 allocs。
- **方案 3 (`MethodGroup`)**：创建 1 个委托。Total = 1 alloc。

**结论**：在热点路径（Hot Path）或频繁调用的每帧逻辑中，**方案 3 优于方案 2**。

## 总结建议

1. **能 Invoke 就 Invoke**：不要无缘无故包装。
2. **警惕 Lambda 闭包**：在 Update 循环或频繁触发的事件中，避免使用捕获变量的 Lambda。
3. **方法组是良药**：如果你为了“干净”而用 Lambda 包装简单的函数调用，请改用方法组或定义私有辅助方法，能省去闭包分配。
4. **缓存委托**：如果某个委托被反复使用且逻辑不变，将其缓存为静态字段或成员变量，可以将分配降为 **0**（初始化后）。

```csharp
// 最佳优化：缓存委托
private Action _cachedAction;

public void Init() {
    _cachedAction = ExecuteFunc2Wrapper;
}

public void Update() {
    // 0 Allocation here!
    Execute(_cachedAction);
}
```
