---
title: "Squad Stack FSM and Behavior Tree Synergy Architecture"
date: 2026-01-05T14:40:00+08:00
draft: false
tags: ["Architecture", "Zenject", "Unity", "BehaviorTree", "FSM"]
---

# Squad Stack FSM Architecture Design Document

## 1. Background and Objectives

In SLG/RTS games, the behavior logic of units (Squads) is extremely complex. It involves both rigid programmatic logic (e.g., data initialization, state cleanup) and highly variable presentation logic (e.g., spawn animation duration, idle animation switching, death effects).

Traditional approaches often fall into two extremes:

1. **Pure Code Implementation**: Programmers hardcode all state transitions. The downside is that designers need programmer intervention to modify presentation details (like adjusting spawn animation time), leading to slow iteration loops.
2. **Pure Behavior Tree Implementation**: Relying entirely on the Behavior Tree to control the lifecycle. The downside is that the rigor of state management is hard to guarantee, often leading to lost states or logical anomalies.

To address these issues, we designed a hybrid architecture: **"Code-Driven Signal, Design-Driven Execution"**.

## 2. Core Components and Relationships

This architecture involves five core modules working in synergy to drive Squad behavior.

### 2.1 ServerSquad / ClientSquad (Unit Actions)

* **Role**: The unit entity, holder of the FSM.
* **Responsibilities**:
  * Entry point for the programmatic lifecycle (`InitAsync`, `OnBattleStart`, `ShutdownAsync`).
  * Responsible for emitting **"System Signals"**. For example, when unit initialization is complete, the code sets its BlackBoard `StackState` to `Born`.
  * **Note**: The code layer does **NOT** directly call the FSM transition methods (`TransitionState`), it only modifies data (Signals).

### 2.2 Blackboard

* **Role**: Communication Bridge.
* **Responsibilities**: Stores the current **"Desired State"** of the system.
* **Key Key**: `BB_BUFFBINDANIMSTACKSTATE` (Enum: `Born`, `Idle`, `Move`, `Attack`...).
* **Mechanism**: Acts as a passive data container connecting program logic and the Behavior Tree.

### 2.3 Behavior Tree (NpBehave)

* **Role**: The Brain (Decision Maker).
* **Responsibilities**:
  * **Listening for Signals**: Listens for Blackboard value changes via `BlackboardCondition` nodes.
  * **Orchestrating Flow**: Designers can configure all presentation logic before and after state transitions here (e.g., wait 0.5s, play VFX, print logs).
  * **Executing Transitions**: Formally notifies the FSM to switch states via custom Action nodes (`ChangeSquadStackState`).

### 2.4 SquadStackFsm (State Machine Engine)

* **Role**: State Manager.
* **Responsibilities**:
  * Maintains the state stack, managing the currently active logic state (`SquadStateBase`).
  * Provides the `ISquadFsmHandler` interface for Behavior Tree nodes to call.
  * **Privilege Control**: Uses interface segregation to prevent business logic from arbitrarily tampering with states, ensuring only the Behavior Tree (or controlled Actions) can drive state transitions.

### 2.5 Stack Behavior Logic (Concrete State Classes)

* **Role**: Business Logic Executor.
* **Responsibilities**: Implements specific C# logic (e.g., `SquadState_Born`, `SquadState_Idle`).
* **Content**: Includes `OnEnter` (Init), `OnUpdate` (Frame Logic), `OnExit` (Cleanup), `OnRemove` (Disposal).

---

## 3. Design Philosophy and Data Flow

The operation of the entire system can be summarized as: **"Set Signal -> Behavior Tree Reacts -> Execute FSM Transition"**.

### Typical Flow: Squad Born

1. **Code (Signal)**:
    * `ServerSquad.InitAsync()` completes.
    * Code sets Blackboard Value `StackState = Born`.
    * *At this point, the FSM has NOT entered the Context state yet; it is merely a data marker.*

2. **Behavior Tree (Reaction)**:
    * The Behavior Tree's `BlackboardCondition: Born` node evaluates to `True`.
    * Enters the corresponding `Sequence`.
    * **(Designer Configurable Area)**: Designers can insert a `Wait (0.5s)` node here to simulate spawn delay.

3. **Action Node (Execution)**:
    * The Behavior Tree executes the custom node `ChangeSquadStackState`.
    * The node calls `ISquadFsmHandler.TransitionState(Born)`.

4. **FSM (State Logic)**:
    * `SquadStackFsm` receives the request and pushes the `SquadState_Born` instance onto the stack.
    * Executes `SquadState_Born.OnEnter()`, officially starting the spawn logic.

## 4. Architectural Advantages

1. **Extreme Flexibility**:
    * Designers have full control over the **"Timing"** and **"Presentation"** of state transitions. If a designer wants `Born` to trigger with only 50% probability, or wants to check terrain via a Selector before playing animations, they just modify the Behavior Tree connections without requiring programmers to rewrite FSM logic.

2. **Decoupling**:
    * Programmers only define "What states exist" (Class) and "When things should happen" (Signal).
    * The Behavior Tree defines "How it happens" (Flow). This is the Behavior Tree's strength.

3. **Hot-Configuration Capability**:
    * Since the flow is defined by Behavior Tree data, in projects supporting hot-reloadable Behavior Trees, we can dynamically adjust unit AI logic without recompiling code.

4. **Rigor**:
    * Explicit implementation via the `ISquadFsmHandler` interface prevents the View layer or other business systems from bypassing the Behavior Tree to directly modify FSM states, ensuring the Behavior Tree remains the **"Single Source of Truth"**.

## 5. Extensibility

* **Adding New States**:
    1. Define `SquadState_New` in C#.
    2. Add `NewState` to the Enum.
    3. Designers add the corresponding `BlackboardCondition` branch in the Behavior Tree.
* **Sub-State Machines**:
  * The Stack FSM naturally supports state nesting (Stack structure). A smaller FSM or Behavior Tree branch can be run inside a large state (like `Attack`).

## 6. Caveats for Designers

When configuring Behavior Trees using this system, please adhere to the following principles:

1. **Idle is the Foundation (Fallback to Idle)**:
    * Ensure there is always an `Idle` state at the bottom of the FSM stack.
    * When using `RemoveSquadStackState` to remove the current state, ensure the logic falls back to `Idle` or another catch-all state to prevent the logic from halting due to an empty stack.

2. **Do Not Delete "Seemingly Redundant" Transition Nodes**:
    * You might see: `Blackboard Condition (Born)` -> `Change State Node (Born)`.
    * **Do not delete the latter!** The Blackboard condition is just the **Signal** (Switch), while the Change State Node is the actual **Start Button**. If you delete the Change State Node, the FSM will never actually run the C# state logic.

3. **Resetting Blackboard Values**:
    * If a state is transient (like a Trigger), remember to reset the Blackboard Value (`Reset Blackboard Value`) at the end of the flow.
    * Alternatively, use the FSM's `OnRemove` callback to request a signal reset to maintain data consistency.
