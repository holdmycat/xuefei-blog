---
title: "NP 行为树 NetPosition 分流架构规则"
date: 2026-01-08T09:40:00+08:00
draft: false
tags: ["Architecture", "Zenject", "Unity", "BehaviorTree"]
---

# NP 行为树 NetPosition 分流架构规则

本文档定义了基于日志、代码和“Selector + Blackboard(NetPosition) 分流”的行为树设计规则与注意事项。

## 1. 核心设计原则

### 1.1 单棵树双端运行

同一棵行为树配置（Graph）会在 Server 与 Client 端各自实例化并运行 `Start()`。每端拥有独立的 `NPRuntimeContext` 和运行时数据。

### 1.2 端位分流机制 (Blackboard Splitting)

运行时通过 `NPRuntimeTreeFactory.Create` 将当前端的 `NetPosition` 写入黑板（`ConstData.BB_NETPOSITION`）。

- **根节点分流**：树的根部通常直接连接一个 `Selector`。
- **分支条件**：使用 `BlackboardCondition` 判断 `BB.NetPosition` 的值（如 `== eServerOnly` 或 `!= eServerOnly`），从而进入对应的 Server 分支或 Client 分支。

### 1.3 职责分离

- **Server 分支（权威）**：负责执行 `NP_ChangeSquadStackStateAction` 等状态变更逻辑、AI 决策、伤害判定等权威操作。
- **Client 分支（表现）**：负责 VFX、动画播放、UI 提示和本地日志。**严禁直接修改权威状态**，客户端状态应只响应 RPC 同步 (`ApplyRemoteStackState`)。

## 2. 行为树结构模板

标准的分流结构如下：

```text
Root
└─ Selector
   ├─ [BB.NetPosition == eServerOnly]  (Server 分支 - 权威逻辑)
   │  └─ Sequence
   │     ├─ PrintDebug("Server: Born Start")
   │     ├─ ... (服务器逻辑：状态切换 / 伤害判定 / 决策)
   │     ├─ ChangeSquadStackState(Born -> Idle)
   │     └─ PrintDebug("Server: Idle Start")
   │
   └─ [BB.NetPosition != eServerOnly]  (Client 分支 - 表现逻辑)
      └─ Sequence
         ├─ PrintDebug("Client: Born Start")
         ├─ ... (客户端表现：VFX / 播放动画 / UI提示)
         └─ PrintDebug("Client: Idle Start")
```

## 3. 节点权限与清单

### 3.1 仅 Server 分支允许的节点

- **状态变更**：`NP_ChangeSquadStackStateAction`, `NP_RemoveSquadStackStateAction`
- **逻辑判定**：任何影响游戏性结果的判定（命中计算、AI 寻路目标确认）。

### 3.2 允许 Client 分支的节点

- **表现层**：VFX 触发、动画状态机设置、Audio 播放。
- **UI/调试**：UI 展示节点、客户端特有的调试日志。
- **等待**：用于配合表现节奏的 `Wait`。

### 3.3 双端通用的节点

- **流程控制**：`Wait`, `WaitUntilStopped` (主要用于保持状态不退出)。
- **只读逻辑**：读取黑板数据的条件节点 (Condition)。
- **调试**：`PrintDebug` (建议带上前缀区分端位)。

## 4. ExecuteOn 属性使用指南

除了树结构的分支外，单个节点（如 Action 和 Task）上的 `ExecuteOn` 属性提供了第二层过滤：

- **服务器逻辑节点**：设置 `ExecuteOn = eServerOnly`。
- **客户端表现节点**：设置 `ExecuteOn = eLocalPlayer | eHost` (Host 模式下服务器也承担表现)。
- **通用等待节点**：`ExecuteOn = eServerOnly | eLocalPlayer | eHost` (确保无论在哪端都能正确挂起)。

**注意**：如果不确定，优先依赖“树分支结构”进行隔离，`ExecuteOn` 作为双重保险。

## 5. 关键注意事项 (Precautions)

1. **禁止客户端切状态**：绝不要在客户端分支放置 `ChangeSquadStackState`。这将导致“本地切状态”与“Server RPC 同步”冲突，引发状态机混乱。
2. **黑板初始化**：必须确保 `NP.Create()` 阶段正确写入了 `BB.NetPosition`。这是整个分流逻辑生效的前提。
3. **条件与属性一致性**：避免“分支条件放行”但“ExecuteOn 拦截”的情况。这会造成逻辑进入分支却没有任何节点执行的“假死”现象，增加调试难度。
4. **Selector 顺序**：建议 **Server 分支在前**。利用 Selector 的短路特性，明确优先级，防止逻辑意外落入 Client 分支。
5. **日志误区**：客户端的日志只证明“客户端分支”执行了，**不代表权威状态发生了变更**。查状态问题以 Server 日志为准。

## 6. 调试建议

- **日志前缀**：在 `PrintDebug` 节点中明确加上 `[Server]` 或 `[Client]` 前缀。
- **Inspector 观察**：分别在 Server 和 Client 模式下选中 GameObject，观察行为树运行时的活动节点路径。
