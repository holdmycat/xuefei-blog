---
title: "Squad Behavior Tree & Stack FSM Architecture Design"
date: 2026-01-06T11:26:56+08:00
draft: false
tags: ["Architecture", "Zenject", "Unity", "BehaviorTree", "FSM"]
---

# Squad Behavior Tree & Stack FSM Architecture Design

This document details the current collaborative framework, design rules, and considerations for the Squad, Stack FSM, and Behavior Tree.

## 1. Composition and Responsibilities

### 1.1 BaseSquad / ServerSquad / ClientSquad

**Lifecycle Entry & Container**

- **Initialize FSM**: Responsible for creating the FSM and registering all available states (Born, Idle, Death, etc.) in `TryInitStackFsm`.
- **Network Synchronization**:
  - **Server**: Subscribes to the `SquadStackFsm.OnStateChanged` event and sends RPCs to clients when states change.
  - **Client**: Receives RPC messages and synchronizes the local FSM state via `TransitionState`, ensuring presentation consistency.

### 1.2 SquadStackFsm

**Core Stack FSM**

- **Stack Management**: Supports multiple stacked states, but **only the top state runs** currently.
- **Priority Mechanism**: States are identified by Enum IDs. Internally, a set of priority mappings (or Enum value comparisons) must be maintained. Only high-priority states can interrupt low-priority ones; upon removal of the top state, the next highest priority state automatically resumes.
- **Lifecycle Management**:
  - `TransitionState`: Switches to or pushes a new state.
  - `RemoveState`: Removes a specific state.
  - `ClearStates(bool)`: Clears the active stack. Parameter determines whether to also clear the registry.
- **Event Broadcasting**: `OnStateChanged` notifies external listeners of changes to the current top state.
- **Prerequisite**: States must be registered before use.

### 1.3 SquadStateBase & Subclasses (Born/Idle/Death)

**Concrete State Definitions**

- **State Behavior**:
  - `OnEnter`: Defaults to writing its own `StateId` to the Blackboard Key `BuffBindAnimStackState`. This is critical for the FSM to drive the Behavior Tree.
  - `OnRemove`: Defaults to logging only.
- **Death Special Handling**:
  - Currently serves as a termination point for the flow.
  - On removal (`OnRemove`), it is responsible for resetting the Blackboard to `NullStateID` (implemented in subclass) to avoid residual dirty data.

### 1.4 Behavior Tree

**Logic Driver Layer**

- **Blackboard Driven**: Determines which branch to execute (Born / Idle / Death) by evaluating the `BuffBindAnimStackState` key on the Blackboard.
- **Inversion of Control**: Action Nodes trigger FSM state changes by calling `NP_ChangeSquadStackStateAction`, `NP_RemoveSquadStackStateAction`, or `NP_ClearSquadStackStateAction`.
- **Pacing Control**: Uses nodes like Log and Wait to control the pacing of business logic (e.g., waiting 0.5s for a spawn animation).

## 1.5 Collaboration Flowchart

```mermaid
graph TD
    subgraph "Lifecycle (BaseSquad/ServerSquad)"
        Init[InitAsync] -->|1. Create Factory| FSM[SquadStackFsm]
        Init -->|2. Register States| RegStates[Register State: Born/Idle/Death]
        Init -->|3. Register Network| Net[NetworkBus]
    end

    subgraph "Server Logic"
        BT[Behavior Tree] -->|Check Condition| BB((Blackboard))
        BB -->|Return State| BT
        
        BT -- "Action: TransitionState(NewState)" --> FSM
        
        FSM -->|1. Change Active Stack| Stack[[Active State Stack]]
        Stack -->|2. OnEnter| StateObj[SquadStateBase (Born/Idle/Death)]
        
        StateObj -->|3. Set Blackboard| BB
        StateObj -- "4. OnStateChanged" --> Net
    end

    subgraph "State Details"
        StateObj -- "Start" --> S_Enter[OnEnter: Write BB]
        S_Enter --> S_Update[OnUpdate: Logic]
        S_Update --> S_Remove[OnRemove: Cleanup/Reset BB]
    end

    subgraph "Client Logic"
        Net -->|RPC: RpcSquadStackStateChanged| ClientFSM[Client SquadStackFsm]
        ClientFSM -->|TransitionState| ClientStack[[Client Active Stack]]
        ClientStack -->|Sync Visuals| Visuals[Animation/VFX]
    end

    classDef code font-family:Courier New,font-size:14px;
    class Init,FSM,RegStates,Step1,Step2,Stack,StateObj,BB,BT,Net,ClientFSM,ClientStack,Visuals,S_Enter,S_Update,S_Remove code;
```

## 2. Design Rules

1. **Blackboard as Single Source of Truth**:
    - States must write to the Blackboard themselves upon entry (`OnEnter`).
    - Avoid duplicating writes to the same Blackboard key in Action Nodes or other external logic, ensuring the FSM is the sole authoritative writer for that key.

2. **Registration Mechanism**:
    - All potentially used states must be registered to the FSM during the initialization phase (`InitAsync`).
    - If `ClearStates(true)` is called (clearing registry), states must be re-registered before switching again.

3. **Top-of-Stack Execution Principle**:
    - The system maintains a state stack, but only the state at the top executes logic (`OnUpdate`, etc.).
    - Follows LIFO or Priority Queue rules where high priority interrupts low priority, and lower states resume upon removal.

4. **Authoritative Server Model**:
    - FSM instances run on both Client and Server.
    - **Server** calculates logic and holds final authority, dispatching state change commands via RPC.
    - **Client** receives commands and executes identical `TransitionState` / `RemoveState` logic to synchronize presentation.

5. **Cleanup Strategy**:
    - `ClearStates(false)`: Clears only the active state stack, **retaining** the registry. Suitable for object reuse scenarios like Respawn or Battle Reset.
    - `ClearStates(true)`: Completely clears everything, including the registry. Suitable for object destruction.
    - **Death Flow**: In the current design, the Death state does not proactively clean itself up. Cleanup (Remove/Clear) is triggered by the Behavior Tree's Death branch via an Action Node after logic (e.g., death performance) is complete.

## 3. Future Considerations

1. **Death Performance & Cleanup Timing**:
    - If death animations or events need to play, **do not** immediately clear the state or reset the Blackboard to Null in `Death.OnEnter`.
    - Keep the Death state active for a duration, controlled by a `Wait` node in the Behavior Tree, and execute the cleanup node only after the performance is finished.

2. **Introducing New States**:
    - **C#**: Define a new state class inheriting from `SquadStateBase`, implement `OnEnter` (write Blackboard) and `OnRemove` (reset if necessary).
    - **FSM**: Ensure the new state is registered during Squad initialization.
    - **BT**: Use the corresponding Enum value as a condition in the Behavior Tree.

3. **Object Pooling**:
    - Before recycling an object (Push to Pool), choose the cleanup strategy based on needs. Usually, it is recommended to retain the registry (for direct use on next Pop) and only clear the active stack.

4. **RPC Synchronization**:
    - RPC synchronization relies on the `CurrentState` at the moment `OnStateChanged` triggers.
    - Avoid rapid "Enter State A -> Clear -> Enter State Null" flows within the same frame, as this may cause the network side to receive only Null and miss the critical information of State A.
