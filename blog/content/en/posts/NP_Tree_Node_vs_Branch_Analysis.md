---
title: "NP Tree Architecture Trade-off: Branch Separation vs. Node-Level Separation"
date: 2026-01-03T16:45:00+08:00
draft: false
tags: ["Architecture", "Zenject", "Unity", "BehaviorTree", "DualWorld"]
---

## Problem Context

When implementing an "Isomorphic" behavior tree for Dual-World architectures, the core conflict is: **How to contain two completely different sets of logic (Server Decision vs. Client Presentation) within a single Asset file, while maintaining maintainability and runtime efficiency.**

There are two main architectural approaches:

1. **Branch Separation**: Splitting the flow at the root node, where Server and Client traverse completely different subtrees.
2. **Node-Level Separation**: Handling different logic within each node based on the end type (`IsServer`/`IsClient`).

This article aims to analyze the pros and cons of these two schemes and explore potential optimizations for "Node-Level Separation".

## Scheme A: Branch Separation (Recommended)

This is our currently recommended approach.

- **Implementation**: The root node is a `Selector` that checks `Context.IsServer`.
  - **Server Branch**: Executes full AI decision-making and state writing.
  - **Client Branch**: **Makes no decisions**, only detects Blackboard state changes and plays animations/VFX.
- **Pros**:
  - **Clarity**: You can see two completely distinct execution paths at a glance. Logic and presentation are decoupled.
  - **Debuggability**: It's clear that *this* is running on the Server and *that* is running on the Client, without interference.
  - **Pure Logic**: The Client branch only needs to focus on "how to present" and doesn't need to contain any business judgments (If/Else).
- **Cons**:
  - **Redundancy**: The tree size might grow because some seemingly similar flows (like "detect entering range") might need to be drawn on both sides (one for changing data, one for playing VFX).

## Scheme B: Node-Level Separation

This is another approach that strives for extreme "reuse" and "compact tree size".

- **Implementation**: The same node (e.g., `CheckTargetRange`) runs on both ends.
  - **Server**: Executes real distance detection, returning True/False.
  - **Client**: Modifies internal logic to directly return True (or do nothing), letting the tree continue to the presentation node.
- **Pros**:
  - **Compactness**: Visually, there is only one tree, which looks very concise.
- **Cons**:
  - **Silent Divergence**: The code looks like it's traversing the same node, but the actual logic has already diverged.
  - **Maintenance Hell**: Every node has to separately handle `if (IsServer)`, making it easy to miss Side Effects.
  - **Debugging Difficulty**: It's hard to know why the Client "stopped" at a certain node—was it because the distance wasn't enough (Server judgment) or because it was Mocked to True/False?

## Optimization for Node-Level Separation

If Scheme B must be adopted to reduce tree volume, we suggest introducing a **Metadata Guardrail** mechanism:

### 1. ExecutionMode Metadata

Add an `ExecutionMode` enum to the base class of all nodes:

- `ServerOnly`: Only executes on the Server. Client automatically skips (returns True or False, configurable).
- `ClientOnly`: Only executes on the Client. Server automatically skips.
- `Both`: Executes on both ends (usually composite nodes or pure data calculations).

### 2. Runtime Guardrail

Handle unified logic in the base class:

```csharp
public override bool OnTick() {
    if (Mode == ServerOnly && !Context.IsServer) return true; // Client walks through effortlessly
    if (Mode == ClientOnly && Context.IsServer) return true; // Server ignores presentation
    return OnExecute(); // Execute core logic only if matched
}
```

### 3. Logs and Statistics

Perform Editor-level statistics on "skipped" behaviors to prevent invisible bugs.

## Conclusion and Recommendation

Although "Node-Level Separation" theoretically reduces tree volume, its actual risks (silent bugs, maintenance difficulty) far outweigh the benefits.

**Final Recommendation: Root Branch Separation + Subtree Reuse**

1. **Keep Root Separation**: Ensure physical isolation of duties between the "Brain" (Server) and the "Body" (Client).
2. **Extract Subtrees**: For high-repetition structures, extract them as Subtrees or Macros.
3. **Blackboard Driven**: The Client branch is strictly forbidden from making independent decisions; it must **Read-Only** from Blackboard data synchronized from the Server.

It is better to have a slightly larger tree than to compromise on the absolute clarity of logic flow.
