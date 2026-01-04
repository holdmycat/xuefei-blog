---
title: "NPData Deep Clone Optimization: From Serialization to Manual Cloning"
date: 2026-01-04T10:55:00+08:00
draft: false
tags: ["Architecture", "Performance", "Optimization"]
---

## 1. Problem Background

In the runtime instantiation process of the Behavior Tree (NPBehave), we need to create an independent copy of the runtime data based on ScriptableObject (SO) assets. If we use the objects in the asset directly, runtime state changes (such as `BelongToUnit`, temporary variables) will directly modify the SO asset, leading to "Data Pollution":

- In Editor: Changes are retained in the SO after Play mode ends, affecting the next run.
- At Runtime: Multiple Units sharing the same SO instance will cause state conflicts.

## 2. Evolution of Logic

### 2.1 Phase 1: Direct Reference

- **Mechanism**: `GetData` returns the cached `NP_DataSupportor` source object directly.
- **Problem**: Severe **Data Pollution**. Runtime modifications are written back to the asset.

### 2.2 Phase 2: BSON Deep Copy

- **Mechanism**: Use `DeepCopyHelper` to perform BSON serialization and deserialization on the entire tree.
- **Advantage**: Completely solves the pollution problem and ensures instance independence.
- **Disadvantage**:
  - **High Performance Overhead**: Full BSON encoding and decoding are required for every instantiation, consuming high CPU.
  - **GC Pressure**: Generates a large number of temporary objects.
  - **Lock Contention**: In high concurrency scenarios (e.g., creating a large number of units simultaneously), there may be lock contention inside the serialization library.

## 3. Solution: Manual Deep Clone

Adopt the **`NPDataCloneUtility` + `Clone()` Virtual Method** manual cloning pattern.

### 3.1 Core Mechanism

Instead of blindly serializing the entire tree, use the idea of **"Layered Cloning"**:

- **`NPDataCloneUtility`**: Acts as the cloning entry point, controlling the overall flow.
- **`virtual Clone()`**: Define virtual methods in data base classes (`NP_ClassForStoreAction`, `ANP_BBValue`, `NP_NodeDataBase`).

### 3.2 Implementation Details

1. **Base Class Definition**
    - Define `virtual Clone()` in `NP_ClassForStoreAction`.
    - The default implementation uses `MemberwiseClone()` (shallow copy), and then **explicitly clears runtime fields** (zeroing out `Context`, `Action`, `BelongToUnit`, etc.).
    - **Reference Type Handling**: If the Action contains reference type fields like List/Dictionary, they need to be manually `new`-ed and copied in the overridden Clone.

2. **Node Cloning**
    - `NP_ActionNodeData` overrides `Clone()` and MUST call the inner Action's `Clone()` method to ensure the Action instance is brand new.

3. **Blackboard Cloning**
    - `ANP_BBValue` and its subclasses (Int, Bool, Float) implement `Clone()` to ensure the independence of blackboard values.

4. **Utility Integration**
    - `NPDataCloneUtility.CloneNode` prioritizes calling the object's `Clone()` method.
    - Fallback schemes are considered only when the object does not implement special `Clone` logic (rare cases), although the goal is to completely remove serialization.

### 3.3 Pros and Cons

- **Pros**:
  - **Zero Pollution**: Mechanically guarantees the independence of runtime data.
  - **High Performance**: Removes expensive reflection and serialization/deserialization steps, performing only necessary memory copying.
  - **Controllability**: Developers can precisely control which fields need to be cloned and which need to be reset.
- **Cons**:
  - **Development Cost**: When adding complex data structures, one must remember to implement the `Clone()` method (but this conforms to standard C# / Prototype Pattern practices).

## 4. Conclusion

Through the comparison of `DeepCloneHelper` vs `NPDataCloneUtility`, manual deep cloning is the best practice for solving performance bottlenecks in SLG large-scale unit creation. It maintains data safety (no pollution) while minimizing CPU and GC overhead.
