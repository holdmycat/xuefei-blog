---
title: "Squad FSM 权限控制：显式接口实现模式"
date: 2026-01-05T09:30:00+08:00
draft: false
tags: ["Architecture", "Zenject", "Unity", "C#", "FSM"]
---

## 1. 问题背景 (Problem Background)

在我们的 SLG 战斗系统中，**Squad (军团/小队)** 的行为逻辑由三个核心部分组成：

1. **ServerSquad (上下文管理器)**: 负责持有数据、组件初始化和生命周期管理。
2. **SquadStackFsm (栈式状态机)**: 负责管理具体的逻辑状态类 (如 `BornState`, `IdleState`) 及其生命周期 (`OnEnter`, `OnExit`)。
3. **Behavior Tree (行为树)**: 负责高层的决策逻辑 (如 "发现敌人 -> 切换到 Chase 状态")。

### 之前的逻辑 (Previous Logic)

最初的设计中，`SquadStackFsm` 提供了一个公开的 `SetState(StateEnum state)` 方法。
这意味着任何持有 FSM 引用的对象都可以随意改变 Squad 的状态：

- `ServerSquad` 在初始化时直接调用 `SetState(Born)`。
- `BornState` 在计时结束后直接调用 `SetState(Idle)`。
- 理论上，任何其他的系统或 Component 都可以调用此方法。

### 为什么违背设计原则 (Why it violated principles)

这种**"谁都能改状态"**的设计会导致逻辑混乱。我们期望的设计原则是：
> **"行为树是决策的大脑，FSM 只是执行的手脚。"**

如果 `ServerSquad` 或具体的 `State` 脚本随意切换状态，就绕过了行为树的决策层，导致"大脑"不知道"手脚"在干什么，或者产生难以调试的状态竞态条件 (Race Conditions)。

## 2. 解决方案：显式接口实现 (Explicit Interface Implementation)

为了从**代码结构层面**强制执行这一原则，我们采用了 C# 的 **显式接口实现 (Explicit Interface Implementation)** 特性。

### 2.1 定义特权接口

我们定义了一个仅供"特权管理者"（如行为树节点）使用的接口：

```csharp
// ISquadFsmHandler.cs
public interface ISquadFsmHandler
{
    // 只有持有此"钥匙"的人才能以此方法切换状态
    void TransitionState(eBuffBindAnimStackState newState, bool force = false);
}
```

### 2.2 显式实现接口

在 `SquadStackFsm` 中，我们**移除**了公开的 `SetState` 方法，改为显式实现上述接口：

```csharp
// SquadStackFsm.cs
public class SquadStackFsm : ISquadFsmHandler
{
    // [Removed] public void SetState(...) 
    
    // [New] 只有转型为 ISquadFsmHandler 才能看到此方法
    void ISquadFsmHandler.TransitionState(eBuffBindAnimStackState state, bool force)
    {
        InternalSetState(state, force);
    }

    private void InternalSetState(...) { /* 实际的切换逻辑 */ }
}
```

### 2.3 权限隔离效果

#### 🚫 禁止访问

在 `ServerSquad` 或其他普通脚本中，直接调用会报错，因为方法被隐藏了：

```csharp
_stackFsm.TransitionState(Idle); // 编译错误！SquadStackFsm 不包含此方法
_stackFsm.SetState(Idle);        // 编译错误！方法已移除
```

#### ✅ 授权访问

只有在我们可以明确控制的地方（例如行为树的 Action Node，或者底层的 RPC 同步），通过**显式类型转换 (Explicit Cast)** 来获取权限：

```csharp
// ServerSquad.cs (初始化引导) 或 BehaviorTreeNode
if (_stackFsm is ISquadFsmHandler fsmHandler)
{
    // 这种 cast 操作显式地表明："我知道我在做什么，我拥有切换状态的特权"
    fsmHandler.TransitionState(eBuffBindAnimStackState.Born, true);
}
```

## 3. 总结

通过显式接口实现，我们将 `SetState` 的调用权限收归到 **行为树 (Behavior Tree)** 和 **基础设施 (RPC/Init)** 手中。并在代码层面清晰地划分了边界：

- 普通业务逻辑只能 **读取** 状态 (`CurrentState`)。
- 只有决策层 (Brain) 才能 **写入** 状态 (`TransitionState`)。
这极大地提高了现有架构的可维护性和安全性。
