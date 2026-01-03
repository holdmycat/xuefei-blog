---
title: "NP 行为树双端架构方案对比：分支分离 vs 节点级分离"
date: 2026-01-03T16:45:00+08:00
draft: false
tags: ["Architecture", "Zenject", "Unity", "BehaviorTree", "DualWorld"]
---

## 问题背景 (Problem)

在实现“双端同构”行为树时，我们要解决的核心矛盾是：**如何在一个资产文件（Asset）中包含两套完全不同的逻辑（Server 决策 vs Client 表现），同时保持可维护性与运行效率。**

对此，主要有两种架构思路：

1. **端分支分离（Branch Separation）**：在根节点进行分流，服务器和客户端走完全不同的子树。
2. **节点级分离（Node-Level Separation）**：在每个节点内部根据端类型（IsServer/IsClient）处理不同逻辑。

本文旨在分析这两种方案的优劣，并探讨“节点级分离”的优化可能。

## 方案 A：端分支分离 (Branch Separation)

这是我们当前推荐的方案。

- **实现方式**: 根节点是一个 `Selector`，判断 `Context.IsServer`。
  - Server 分支：执行完整的 AI 决策、状态写入。
  - Client 分支：**不进行决策**，只检测黑板状态变化，播放动画/特效。
- **优点**:
  - **结构清晰 (Clarity)**: 一眼就能看出两条完全不同的执行路径，逻辑与表现解耦。
  - **调试容易 (Debuggability)**: 这里是服务器在跑，那里是客户端在跑，互不干扰。
  - **逻辑纯粹**: 客户端分支只需要关注“如何表现”，不需要包含任何业务判断（If/Else）。
- **缺点**:
  - **节点冗余 (Redundancy)**: 树的规模可能会变大，因为某些看起来相似的流程（如“检测进入范围”）可能需要在两边都画节点（一边是为了改数据，一边是为了播特效）。

## 方案 B：节点级分离 (Node-Level Separation)

这是另一种思路，试图追求极致的“复用”和“小规模树”。

- **实现方式**: 同一个节点（例如 `CheckTargetRange`）在两端都运行。
  - Server: 执行真实距离检测，返回 True/False。
  - Client: 修改内部逻辑，直接返回 True（或者什么都不做），让树继续往下走到表现节点。
- **优点**:
  - **树规模极小 (Compactness)**: 视觉上只有一棵树，看起来很简洁。
- **缺点**:
  - **隐形分叉 (Silent Divergence)**: 看起来代码在走同一个节点，但实际逻辑早已分叉。
  - **维护地狱**: 每个节点都要单独处理 `if (IsServer)`，很容易遗漏副作用（Side Effects）。
  - **调试困难**: 很难知道客户端为什么“停”在了某个节点，是因为距离不够（Server判定）还是因为被 Mock 成了 True/False？

## 节点级分离的优化建议 (Optimization for Node-Level)

如果必须采用方案 B 以减小树的体积，建议引入 **元数据护栏** 机制：

### 1. ExecutionMode 元数据

给所有节点基类增加 `ExecutionMode` 枚举：

- `ServerOnly`: 仅服务器执行。客户端自动跳过（返回 True 或 False，可配置）。
- `ClientOnly`: 仅客户端执行。服务器自动跳过。
- `Both`: 双端都执行（通常是组合节点或纯数据计算）。

### 2. 运行时护栏

基类统一处理：

```csharp
public override bool OnTick() {
    if (Mode == ServerOnly && !Context.IsServer) return true; // 客户端如履平地
    if (Mode == ClientOnly && Context.IsServer) return true; // 服务器无视表现
    return OnExecute(); // 只有匹配才执行核心逻辑
}
```

### 3. 日志与统计

对“跳过”的行为进行 Editor 级别的统计，防止隐形 Bug。

## 结论与建议 (Conclusion)

虽然“节点级分离”在理论上能减小树的体积，但其实际风险（隐形 Bug、维护难度）远大于收益。

**最终推荐方案：根部端分支分离 + 少量复用 (Subtree Reuse)**

1. **保持根部分离**：确保“大脑”（Server）和“躯干”（Client）的职责物理隔离。
2. **提取子树（Subtree）**：对于重复率高的结构，提取为子树或宏。
3. **黑板驱动**：客户端分支严禁任何独立决策，**只读**服务器同步过来的黑板数据。

宁可树看起来大一点，也要保证逻辑流向的绝对清晰。
