---
title: "NPData 数据克隆优化策略：从序列化到手写克隆"
date: 2026-01-04T10:55:00+08:00
draft: false
tags: ["Architecture", "Performance", "Optimization"]
---

## 1. 问题背景 (Problem Background)

在行为树 (NPBehave) 的运行时实例化过程中，我们需要基于 ScriptableObject (SO) 资产创建一份独立的运行时数据副本。如果直接使用资产中的对象，运行时状态的变化（如 `BelongToUnit`、临时变量）会直接修改 SO 资产，导致“数据污染”：

- 编辑器下：Play 模式结束后，修改会被保留在 SO 中，影响下次运行。
- 运行时：多个 Unit 共享同一个 SO 实例会导致状态冲突。

## 2. 之前的逻辑与演进 (Evolution of Logic)

### 2.1 阶段一：直接使用 (Direct Reference)

- **机制**：`GetData` 直接返回缓存的 `NP_DataSupportor` 源对象。
- **问题**：严重的**数据污染**。运行时修改直接写回资产。

### 2.2 阶段二：BSON 序列化深拷贝 (BSON Deep Copy)

- **机制**：使用 `DeepCopyHelper` 对整棵树进行 BSON 序列化再反序列化。
- **优点**：彻底解决了污染问题，保证了实例独立性。
- **缺点**：
  - **性能开销大**：每次实例化都需要进行完整的 BSON 编码解码，CPU 消耗高。
  - **GC 压力**：产生大量临时对象。
  - **锁竞争**：在高并发场景下（如大量单位同时创建），序列化库内部可能存在锁竞争。

## 3. 解决方案：显式手写克隆 (Manual Deep Clone)

采用 **`NPDataCloneUtility` + `Clone()` 虚方法** 的手写克隆模式。

### 3.1 核心机制

不再对整棵树进行盲目的序列化，而是利用 **“逐层克隆”** 的思想：

- **`NPDataCloneUtility`**：作为克隆入口，控制整体流程。
- **`virtual Clone()`**：在数据基类 (`NP_ClassForStoreAction`, `ANP_BBValue`, `NP_NodeDataBase`) 中定义虚方法。

### 3.2 实现细节

1. **基类定义 (Base Class Definition)**
    - 在 `NP_ClassForStoreAction` 中定义 `virtual Clone()`。
    - 默认实现使用 `MemberwiseClone()` (浅拷贝)，然后**显式清理运行时字段** (如 `Context`, `Action`, `BelongToUnit` 等归零)。
    - **引用类型处理**：如果 Action 中包含 List/Dictionary 等引用类型字段，需要在重写的 Clone 中手动 `new` 新容器并拷贝内容。

2. **节点克隆 (Node Cloning)**
    - `NP_ActionNodeData` 重写 `Clone()`，必须调用内部 Action 的 `Clone()` 方法，确保 Action 实例是全新的。

3. **黑板克隆 (Blackboard Cloning)**
    - `ANP_BBValue` 及其子类 (Int, Bool, Float) 实现 `Clone()`，确保黑板值的独立性。

4. **工具类整合 (Utility Integration)**
    - `NPDataCloneUtility.CloneNode` 优先调用对象的 `Clone()` 方法。
    - 仅在对象未实现特殊 `Clone` 逻辑时（极少数情况），才考虑降级方案（虽然目标是完全移除序列化）。

### 3.3 优劣势分析

- **优势**：
  - **零污染**：从机制上保证了运行时数据的独立性。
  - **高性能**：去掉了昂贵的反射和序列化/反序列化步骤，只做必要的内存复制。
  - **可控性**：开发者可以精确控制哪些字段需要克隆，哪些需要重置。
- **劣势**：
  - **开发成本**：新增复杂数据结构时，需要记得实现 `Clone()` 方法（但这符合 C# 也就是 Prototype 模式的标准实践）。

## 4. 结论 (Conclusion)

通过 `DeepCloneHelper` vs `NPDataCloneUtility` 的对比，显式手写克隆是解决 SLG 大规模单位创建性能瓶颈的最佳实践。它在维持数据安全（无污染）的同时，将 CPU 和 GC 开销降至最低。
