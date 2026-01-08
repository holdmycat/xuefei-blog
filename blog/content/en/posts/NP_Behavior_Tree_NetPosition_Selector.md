---
title: "NP Behavior Tree NetPosition Selector Architecture Rules"
date: 2026-01-08T09:40:00+08:00
draft: false
tags: ["Architecture", "Zenject", "Unity", "BehaviorTree"]
---

# NP Behavior Tree NetPosition Selector Architecture Rules

This document defines the rules and best practices for Behavior Tree design based on "Selector + Blackboard(NetPosition) Separation", utilizing dual-world logs and code principles.

## 1. Core Design Principles

### 1.1 Single Tree, Dual Execution

The same Behavior Tree configuration (Graph) is instantiated and `Start()`-ed on both the Server and Client independently. Each end maintains its own `NPRuntimeContext` and runtime data.

### 1.2 NetPosition Splitting Mechanism

During runtime, `NPRuntimeTreeFactory.Create` writes the current end's `NetPosition` into the Blackboard (`ConstData.BB_NETPOSITION`).

- **Root Separation**: The root of the tree is typically directly connected to a `Selector`.
- **Branch Condition**: A `BlackboardCondition` node checks `BB.NetPosition` (e.g., `== eServerOnly` or `!= eServerOnly`) to route execution into either the Server branch or the Client branch.

### 1.3 Separation of Concerns

- **Server Branch (Authoritative)**: Responsible for `NP_ChangeSquadStackStateAction`, state transitions, AI decision-making, damage calculation, and other authoritative logic.
- **Client Branch (Presentation)**: Responsible for VFX, Animation playback, UI cues, and local logging. **Strictly forbidden from modifying authoritative state**. Client state should only respond to RPC synchronization (`ApplyRemoteStackState`).

## 2. Behavior Tree Structure Template

The standard separation structure is as follows:

```text
Root
└─ Selector
   ├─ [BB.NetPosition == eServerOnly]  (Server Branch - Authoritative Logic)
   │  └─ Sequence
   │     ├─ PrintDebug("Server: Born Start")
   │     ├─ ... (Server Logic: State Transition / Damage / Decision)
   │     ├─ ChangeSquadStackState(Born -> Idle)
   │     └─ PrintDebug("Server: Idle Start")
   │
   └─ [BB.NetPosition != eServerOnly]  (Client Branch - Presentation Logic)
      └─ Sequence
         ├─ PrintDebug("Client: Born Start")
         ├─ ... (Client Presentation: VFX / Animation / UI)
         └─ PrintDebug("Client: Idle Start")
```

## 3. Node Permissions & Checklist

### 3.1 Nodes Allowed Only in Server Branch

- **State Transition**: `NP_ChangeSquadStackStateAction`, `NP_RemoveSquadStackStateAction`.
- **Logic Judgment**: Any check determining gameplay results (hit calculation, AI target confirmation).

### 3.2 Nodes Allowed in Client Branch

- **Presentation**: VFX triggers, Animation state setting, Audio playback.
- **UI/Debug**: UI display nodes, client-specific debug logs.
- **Wait**: `Wait` nodes used to pace presentation effects.

### 3.3 Nodes Common to Both Ends

- **Flow Control**: `Wait`, `WaitUntilStopped` (Mainly used to prevent state exit).
- **Read-Only Logic**: Condition nodes reading Blackboard data.
- **Debug**: `PrintDebug` (Prefix recommended to distinguish ends).

## 4. ExecuteOn Attribute Guidelines

Apart from tree structure separation, the `ExecuteOn` attribute on individual nodes (Actions/Tasks) provides a second layer of filtering:

- **Server Logic Nodes**: Set `ExecuteOn = eServerOnly`.
- **Client Presentation Nodes**: Set `ExecuteOn = eLocalPlayer | eHost` (Server also handles presentation in Host mode).
- **Common Wait Nodes**: `ExecuteOn = eServerOnly | eLocalPlayer | eHost` (Ensures correct suspension on both ends).

**Note**: If unsure, prioritize "Tree Branch Separation" for isolation, using `ExecuteOn` as a double safety net.

## 5. Precautions

1. **No Client State Transitions**: Never place `ChangeSquadStackState` in the Client branch. This causes conflicts between "Local State Transition" and "Server RPC Sync", leading to FSM chaos.
2. **Blackboard Initialization**: Ensure `BB.NetPosition` is correctly written during `NP.Create()`. This is the prerequisite for the entire separation logic.
3. **Condition vs. Attribute Consistency**: Avoid cases where "Branch Condition permits" but "ExecuteOn blocks". This creates a "Zombie Node" scenario where execution enters the branch but no nodes run, complicating debugging.
4. **Selector Order**: Recommend **Server Branch First**. Leveraging Selector short-circuiting ensures priority and prevents accidental fall-through to the Client branch.
5. **Log Misconception**: Client logs only prove the "Client Branch" executed; **they do not imply authoritative state changes**. Always check Server logs for state issues.

## 6. Debugging Suggestions

- **Log Prefixes**: Clearly add `[Server]` or `[Client]` prefixes in `PrintDebug` nodes.
- **Inspector Monitoring**: Select the GameObject in Server and Client modes respectively to observe the active node path in the running Behavior Tree.
