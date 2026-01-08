---
title: "游戏循环与死亡屏障 (Game Loop & Death Barrier)"
date: 2026-01-08T09:58:00+08:00
draft: false
tags: ["Architecture", "System Design", "Unity", "GameLoop"]
---

# 游戏循环与死亡屏障 (Game Loop & Death Barrier)

本文档描述了游戏的核心循环流程（开始 -> 结束 -> 再来一局），重点阐述了在“再来一局”过程中引入的**死亡屏障 (Death Barrier)** 机制，以解决异步回收与复活逻辑冲突的问题。

## 1. 核心问题

在实现“再来一局”功能时，直接复活对象会导致状态污染，主要原因如下：

- **异步死亡**：死亡逻辑通常包含异步过程（死亡动画、特效延迟、清理逻辑），不能立即完成。
- **状态冲突**：如果部分 Squad 还在执行死亡表现时，复活逻辑就开始重置数据并启动行为树，会导致 visuals（表现层）与 logic（逻辑层）状态不一致，甚至报错。

**解决方案**：引入“死亡屏障”，将流程强制划分为互斥的阶段。

## 2. 完整流程设计

### 阶段 A：首局启动 (Initial Start)

1. **初始化**：
    - Server/Client 创建所有 Squad。
    - 行为树启动 (`Start()`)。
2. **就绪检测**：
    - 客户端行为树进入 `Idle` 状态时，通过广播触发 **“所有 Squad 就绪”** 事件。
3. **UI 介入**：
    - `UIScene_ShowCaseScene` 捕捉该事件，弹出 **“开始战斗”** 按钮。
    - 用户点击开始，触发战斗状态流转。

---

### 阶段 B：再来一局 (Restart Loop)

当游戏结束，用户点击“再来一局”时，执行以下严格时序：

#### 1. 触发回合结束

- 系统广播“回合结束”信号。
- 所有 **存活 (Alive)** 的 Squad 强制进入 **死亡逻辑 (Death)**：
  - FSM 切换到 `Death` 状态。
  - 播放死亡动画/特效。
  - 执行数据清理。

#### 2. 死亡屏障 (Death Barrier) - **关键点**

- 系统进入 **“等待清理”** 状态。
- 每个 Squad 在完成其死亡逻辑（包括异步动画）后，回调上报 **“死亡完成”**。
- `Commander` 或 `GameManager` 统计死亡完成数量。
- **阻塞条件**：直到 **所有** Squad 都上报完成，才允许进入下一阶段。

#### 3. 复活阶段 (Revival)

- 屏障解除，进入复活流程：
  - **重置数据**：清空 FSM 状态、清空 Blackboard 临时数据。
  - **重置位置**：将 Squad 移回出生点。
  - **重启 AI**：重新挂载/启动行为树 (`Start()`)。

#### 4. UI 恢复

- Client 再次检测到所有 Squad 进入 `Idle`。
- 重新弹出 **“开始战斗”** UI，闭环完成。

## 3. 实现要点 (Implementation)

### 3.1 死亡完成事件

每个 Squad 需要暴露一个回调或事件，例如：

```csharp
public event Action OnDeathProcessComplete;
// 在 Death State 的 Exit 或动画结束回调中触发
```

### 3.2 屏障逻辑 (Barrier Logic)

在管理类中实现计数器或列表检查：

```csharp
private int _pendingDeathCount;

public void RestartGame() {
    _pendingDeathCount = _allSquads.Count;
    foreach(var squad in _allSquads) {
        squad.ForceDeath(onComplete: OnSingleSquadDeathComplete);
    }
}

private void OnSingleSquadDeathComplete() {
    _pendingDeathCount--;
    if (_pendingDeathCount <= 0) {
        StartRevivalPhase(); // 屏障解除
    }
}
```

### 3.3 复活清理

复活不仅仅是 `SetActive(true)`，必须包含深度的状态重置：

- 停止当前正在运行的行为树（防止残留 Task 继续执行）。
- 清理 Blackboard 中上一局遗留的 Target/状态。
- 重置 FSM 到 Default State。

## 4. 结论

通过引入“死亡屏障”，我们将“销毁”和“重建”两个可能重叠的时间段强行拆开，确保了每一次“再来一局”都是在一个干净、确定的内存与逻辑状态下开始。
