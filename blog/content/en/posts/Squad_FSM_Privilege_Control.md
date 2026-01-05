---
title: "Squad FSM Permission Control: Explicit Interface Implementation Pattern"
date: 2026-01-05T09:30:00+08:00
draft: false
tags: ["Architecture", "Zenject", "Unity", "C#", "FSM"]
---

## 1. Problem Background

In our SLG combat system, the behavior logic of a **Squad** consists of three core components:

1. **ServerSquad (Context Manager)**: Responsible for holding data, component initialization, and lifecycle management.
2. **SquadStackFsm (Stack-based FSM)**: Responsible for managing specific logic state classes (e.g., `BornState`, `IdleState`) and their lifecycles (`OnEnter`, `OnExit`).
3. **Behavior Tree**: Responsible for high-level decision-making logic (e.g., "Enemy spotted -> Switch to Chase state").

### Previous Logic

Initially, `SquadStackFsm` provided a public `SetState(StateEnum state)` method.
This meant that any object holding a reference to the FSM could arbitrarily change the Squad's state:

- `ServerSquad` directly called `SetState(Born)` during initialization.
- `BornState` directly called `SetState(Idle)` after its timer finished.
- Theoretically, any other system or Component could call this method.

### Why it violated principles

This **"Anyone can change state"** design leads to logical chaos. Our desired design principle is:
> **"The Behavior Tree is the brain for decision making, the FSM is just the hands and feet for execution."**

If `ServerSquad` or specific `State` scripts can switch states at will, they bypass the Behavior Tree's decision layer, causing the "brain" to be unaware of what the "hands and feet" are doing, or creating hard-to-debug Race Conditions.

## 2. Solution: Explicit Interface Implementation

To enforce this principle at the **code structure level**, we adopted C#'s **Explicit Interface Implementation** feature.

### 2.1 Define Privileged Interface

We defined an interface intended only for use by "Privileged Managers" (such as Behavior Tree Nodes):

```csharp
// ISquadFsmHandler.cs
public interface ISquadFsmHandler
{
    // Only those holding this "key" can switch states using this method
    void TransitionState(eBuffBindAnimStackState newState, bool force = false);
}
```

### 2.2 Explicit Implementation

In `SquadStackFsm`, we **removed** the public `SetState` method and explicitly implemented the above interface instead:

```csharp
// SquadStackFsm.cs
public class SquadStackFsm : ISquadFsmHandler
{
    // [Removed] public void SetState(...) 
    
    // [New] Only visible if cast to ISquadFsmHandler
    void ISquadFsmHandler.TransitionState(eBuffBindAnimStackState state, bool force)
    {
        InternalSetState(state, force);
    }

    private void InternalSetState(...) { /* Actual transition logic */ }
}
```

### 2.3 Permission Isolation Effects

#### 🚫 Access Denied

In `ServerSquad` or other standard scripts, calling directly results in an error because the method is hidden:

```csharp
_stackFsm.TransitionState(Idle); // Compile Error! SquadStackFsm does not contain this method
_stackFsm.SetState(Idle);        // Compile Error! Method removed
```

#### ✅ Access Granted

Only in places we explicitly control (such as Behavior Tree Action Nodes, or underlying RPC synchronization), do we use **Explicit Cast** to gain permission:

```csharp
// ServerSquad.cs (Initialization Bootstrap) or BehaviorTreeNode
if (_stackFsm is ISquadFsmHandler fsmHandler)
{
    // This cast explicitly states: "I know what I'm doing, I have the privilege to switch states"
    fsmHandler.TransitionState(eBuffBindAnimStackState.Born, true);
}
```

## 3. Conclusion

By using Explicit Interface Implementation, we have restricted the permission to call `SetState` to the **Behavior Tree** and **Infrastructure (RPC/Init)**. We have clearly defined boundaries at the code level:

- Ordinary business logic can only **Read** the state (`CurrentState`).
- Only the decision layer (Brain) can **Write** the state (`TransitionState`).
This significantly improves the maintainability and safety of the existing architecture.
