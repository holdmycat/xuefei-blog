---
title: "Squad 栈状态机与行为树协同架构设计"
date: 2026-01-05T14:40:00+08:00
draft: false
tags: ["Architecture", "Zenject", "Unity", "BehaviorTree", "FSM"]
---

# Squad 栈状态机架构设计文档

## 1. 背景与目标

在 SLG/RTS 类游戏中，单位（Squad）的行为逻辑极其复杂，既包含刚性的程序逻辑（如数据初始化、状态清理），又包含高度可变的表现逻辑（如出生动画时长、待机动作切换、死亡特效等）。

传统的做法往往走向两个极端：

1. **全代码实现**：程序硬编码所有状态流转。缺点是策划修改表现细节（如调整出生动画时间）需要程序介入，迭代慢。
2. **全行为树实现**：完全依赖行为树控制生命周期。缺点是状态管理的严谨性难以保证，容易出现状态丢失或逻辑异常。

为了解决上述问题，我们设计了一套 **"代码驱动信号，策划驱动执行" (Code-Driven Signal, Design-Driven Execution)** 的混合架构。

## 2. 核心组件与关系

本架构涉及以下五个核心模块，它们协同工作，共同驱动 Squad 的行为。

### 2.1 ServerSquad / ClientSquad (Unit Actions)

* **角色**：单位实体，FSM 的持有者。
* **职责**：
  * 程序生命周期的入口（`InitAsync`, `OnBattleStart`, `ShutdownAsync`）。
  * 负责发出 **"系统级信号"**。例如，当单位初始化完成时，代码将其 BlackBoard (黑板) 上的 `StackState` 设置为 `Born`。
  * **注意**：代码层 **不** 直接调用 FSM 的切换方法（`TransitionState`），只负责修改数据（信号）。

### 2.2 Blackboard (黑板)

* **角色**：通信桥梁。
* **职责**：存储当前系统的 **"期望状态"**。
* **关键Key**：`BB_BUFFBINDANIMSTACKSTATE` (枚举: `Born`, `Idle`, `Move`, `Attack`...)。
* **机制**：作为被动数据容器，连接程序逻辑与行为树。

### 2.3 Behavior Tree (行为树 - NpBehave)

* **角色**：决策大脑 (The Brain)。
* **职责**：
  * **监听信号**：通过 `BlackboardCondition` 节点监听黑板值的变化。
  * **编排流程**：策划可以在此配置状态切换前后的所有表现逻辑（如等待 0.5秒，播放特效，打印日志）。
  * **执行切换**：通过自定义 Action 节点 (`ChangeSquadStackState`) 正式通知 FSM 切换状态。

### 2.4 SquadStackFsm (状态机引擎)

* **角色**：状态管理器。
* **职责**：
  * 维护状态栈（Stack），管理当前激活的逻辑状态 (`SquadStateBase`)。
  * 提供 `ISquadFsmHandler` 接口，供行为树节点调用。
  * **权限控制**：通过接口隔离，防止业务层代码随意篡改状态，确保只有行为树（或受控的 Action）能驱动状态流转。

### 2.5 Stack Behavior Logic (具体状态类)

* **角色**：业务逻辑执行者。
* **职责**：实现具体的 C# 逻辑（如 `SquadState_Born`, `SquadState_Idle`）。
* **内容**：包含 `OnEnter` (初始化), `OnUpdate` (帧逻辑), `OnExit` (清理), `OnRemove` (彻底移除)。

---

## 3. 设计思路与数据流向

整个系统的运行流程可以概括为：**"设置信号 -> 行为树响应 -> 执行状态机切换"**。

### 典型流程：Squad 出生 (Born)

1. **Code (Signal)**:
    * `ServerSquad.InitAsync()` 执行完毕。
    * 代码设置黑板值 `StackState = Born`。
    * *此时 FSM 尚未进入 Context 状态，仅是数据层面的标记。*

2. **Behavior Tree (Reaction)**:
    * 行为树的 `BlackboardCondition: Born` 节点变为 `True`。
    * 进入对应的 `Sequence` (序列)。
    * **(策划可配置区域)**：策划可以在这里插入 `Wait (0.5s)` 节点，模拟出生延迟。

3. **Action Node (Execution)**:
    * 行为树执行自定义节点 `ChangeSquadStackState`。
    * 节点调用 `ISquadFsmHandler.TransitionState(Born)`。

4. **FSM (State Logic)**:
    * `SquadStackFsm` 收到请求，将 `SquadState_Born` 实例压入堆栈。
    * 执行 `SquadState_Born.OnEnter()`，正式开始运行出生逻辑。

## 4. 架构优势

1. **极致的灵活性 (Flexibility)**：
    * 策划完全掌控状态切换的 **"时机"** 和 **"表现"**。如果策划希望 Born 只有 50% 概率触发，或者希望 Born 之后通过一个 Selector 先判断地形再决定是否播放动画，他们只需修改行为树连线，无需程序重写状态机逻辑。

2. **逻辑解耦 (Decoupling)**：
    * 程序只负责定义“有哪些状态”（Class）和“什么时候该发生什么”（Signal）。
    * 行为树负责“怎么发生”（Flow）。这是行为树最擅长的领域。

3. **热配置能力**:
    * 由于流程由行为树数据定义，在支持行为树热更的项目中，我们可以动态调整单位的 AI 逻辑而无需重新编译代码。

4. **严谨性**:
    * 通过 `ISquadFsmHandler` 接口显式实现，防止了 View 层或其他业务系统绕过行为树直接修改 FSM 状态，保证了行为树作为 **"单一事实来源 (Single Source of Truth)"** 的地位。

## 5. 扩展性

* **新增状态**：
    1. C# 定义 `SquadState_New`。
    2. 枚举添加 `NewState`。
    3. 策划在行为树添加对应的 `BlackboardCondition` 分支。
* **子状态机**：
  * Stack FSM 天然支持状态嵌套（Stack 结构）。可以在一个大状态（如 `Attack`）内部再运行一个小的 FSM 或行为树分支。

## 6. 策划配置指南 (Caveats for Designers)

在使用这套系统配置行为树时，需要注意以下原则：

1. **Idle 是基石 (Fallback to Idle)**：
    * 务必确保 FSM 栈底有一个 `Idle` 状态。
    * 使用 `RemoveSquadStackState` 移除当前状态时，确保逻辑能回落到 `Idle` 或其他兜底状态，避免栈空导致逻辑停止。

2. **不要删除“看似冗余”的切换节点**：
    * 你可能会看到：`黑板条件(Born)` -> `切换状态节点(Born)`。
    * **不要删除后者！** 黑板条件只是**信号**（开关），切换节点才是真正的**启动键**。如果删除了切换节点，FSM 将永远不会真正运行 C# 里的状态逻辑。

3. **黑板值的重置**：
    * 如果是一个瞬时状态（如 Trigger），记得在流程结束时重置黑板值（`Reset Blackboard Value`）。
    * 或者利用 FSM 的 `OnRemove` 回调来请求重置信号，保持数据的一致性。
