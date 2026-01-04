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
    - **Fallback Mechanism**: Currently, serialization fallback is retained for a minority of uncovered types (Nodes/BBValues that haven't implemented `Clone`). The goal is to eventually "completely remove" serialization; remaining types can be implemented on an as-needed basis.

### 3.3 Pros and Cons & Performance Bottlenecks

- **Pros**:
  - **Zero Pollution**: Mechanically guarantees the independence of runtime data.
  - **High Performance**: Removes expensive reflection and serialization/deserialization steps, performing only necessary memory copying.
  - **No Lock Contention**: The manual clone path eliminates the global lock contention issues found in BSON serialization libraries, leaving only pure memory allocation and data copying.
- **Cons & Remaining Bottlenecks**:
  - **Development Cost**: When adding complex data structures, one must remember to implement the `Clone()` method (conforming to Prototype Pattern).
  - **Memory Allocation**: The performance bottleneck of manual cloning is now primarily **memory allocation and copying** (linear growth).
- **Future Optimization**:
  - For massive-scale (10k+) unit creation, strategies like **Object Pooling** or **Shared Immutable Data (Flyweight)** can be introduced to further reduce memory allocation.

## 4. Performance Deep Dive: Why is it so much faster?

"Taking apart a Lego race car, packing it into a box, shipping it to yourself, and then rebuilding it according to the manual" (Serialization) vs "Looking at the original car and building an identical one directly with new bricks" (Manual Clone).

The performance difference between the two is not just "a little faster", but an **Order of Magnitude** difference, mainly reflected in three core dimensions:

### 4.1 "Instruction Density" from CPU Perspective

- **BSON Serialization Path (Generic Black Box)**:
  - Process: Reflection/Type Check -> IO Write/Stream Processing -> Metadata Packing -> Deserialization Parsing -> Assignment.
  - Result: Copying a simple `int` may involve **hundreds** of CPU instructions.
- **Manual Clone Path (Direct Machine Code)**:
  - Process: Direct memory assignment (`newObj.Id = this.Id;`).
  - Result: Compiles to just **1-2** `MOV` instructions.

### 4.2 Memory & GC (Memory Traffic)

- **BSON Path (Middleman Markup)**:
  - Needs to allocate `byte[]` buffers, massive `string` fragments, library internal `List<Token>` temporary objects, etc.
  - Result: Generates a lot of "use and throw" garbage, frequently triggering GC (Stop-The-World) under high concurrency.
- **Manual Clone Path (No Middleman)**:
  - Only `new` the final object needed.
  - Result: **Zero temporary memory allocation**, minimizing GC pressure.

### 4.3 Lock Contention

- **BSON Library Internal Locks**: High-performance serialization libraries maintain a global static Type Cache to accelerate reflection. Under massive concurrency (e.g., creating 1000 units simultaneously), multi-threaded access to this Cache may cause L1/L2 cache invalidation and thread contention.
- **Manual Clone**: Completely **Instance Local** operation. `ObjA.Clone()` and `ObjB.Clone()` are unrelated, making it a **Perfectly Parallel Friendly (Embarrassingly Parallel)** task.

| Dimension | BSON Serialization | Manual Clone | Performance Multiplier Gap |
| :--- | :--- | :--- | :--- |
| **Algorithm Complexity** | O(N) + **Huge Constant** (Reflect/IO) | O(N) + **Tiny Constant** (MOV) | **10x - 100x** |
| **Memory Allocation** | Target Object + **Massive Buffer** | **Target Object Only** | **Significant Difference (GC)** |
| **Concurrency Model** | May contend for global Type Cache lock | **Completely Independent, No Contention** | **Exponential Difference** |

## 5. Conclusion

Through the comparison of `DeepCloneHelper` vs `NPDataCloneUtility`, manual deep cloning is the best practice for solving performance bottlenecks in SLG large-scale unit creation. It maintains data safety (no pollution) while minimizing CPU and GC overhead.
