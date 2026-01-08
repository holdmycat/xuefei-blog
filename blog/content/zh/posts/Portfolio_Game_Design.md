---
title: "Mini-SoulMaster: 技术演示项目设计方案"
date: 2026-01-08T15:00:00+08:00
draft: false
tags: ["GameDesign", "Roguelite", "Portfolio", "Architecture"]
---

# Portfolio Mini-Game Design: "Mini-SoulMaster" (Roguelite Loop)

**文档目标**: 定义基于 `Modular-Skill-System-Demo` 的 5 关制 Roguelite 演示游戏的完整流程，并验证其是否符合 [SLG 主程项目过滤器]( {{< ref "SLG_MainProgrammer_Filter_2025.md" >}} )。

## 1. 过滤器验证 (Filter Validation)

| 过滤器维度 | 判定 | 理由 |
| :--- | :--- | :--- |
| **D1. 自动战斗** | ✅ | 游戏核心为双世界自动战斗，玩家仅在此前配置。 |
| **D2. 战前配置** | ✅ | 每一关开始前的 "3选1" 强化是唯一的策略点。 |
| **D3. 胜负一眼** | ✅ | 5 关流程短平快，不做拉锯战。 |
| **D4. 数值/视觉** | ✅ | 利用技能系统（Skill/Buff）展示大幅数值提升与 VFX。 |
| **D5. 广告截取** | ✅ | 每一关都是一个独立的“战斗切片”。 |
| **D6. 低失败率** | ✅ | **设计修正**：不论输赢均给予奖励并继续，无失败挫败感。 |
| **D7. 结构倍率** | ✅ | 复用同一套 Numeric/Modifier 架构。 |
| **T1-T8 技术项** | ✅ | 复用现有框架（ShowCase, Commander, FSM, Pool）。 |

**结论**: 该项目完全符合“SLG 主程能力证明项目”的定位，适合快速上线展示。

## 2. 游戏流程 (Game Flow)

本游戏没有传统的大厅（Lobby），采用“线性 Roguelite”结构。

### Phase 1: 启动与引导 (Boot & Guide)

* **启动**: 进入 `UIScene_ShowCaseScene` (重命名为 `GameScene`?)。
* **引导 (Tutorial UI)**:
  * 全屏遮罩 + 简单文本：“欢迎来到 SoulMaster 技能系统演示”。
  * **Step 1**: 选择英雄（提供 2 个预设 Commander：*近战/物理* vs *远程/魔法*）。
  * **Step 2**: 确认出征部队（默认配置，无需复杂操作）。
  * **Action**: 点击“开始演示”按钮。

### Phase 2: 战斗循环 (The Loop - 5 Stages)

共 5 个关卡，索引 `Stage 0` 到 `Stage 4`。

#### A. 战斗阶段 (Battle Phase)

* **加载**: 只有摄像机和场景轻微变化，或者仅仅是刷新怪物 `Spawner` 配置。
* **过程**: 自动战斗，玩家只能观察、调整相机、点击查看单位信息（Debug 面板）。
* **结束判定**:
  * **胜利**: 敌方全灭。
  * **失败**: 我方全灭（或超时）。
  * **处理**: 无论胜负，进入 [B. 结算阶段]。

#### B. 结算与强化 (Result & Upgrade)

* **结算弹窗**:
  * 标题：“战斗结束” (Battle Finished)。
  * 描述：“正在加载下一波模拟数据...”。
* **Roguelite 3选1 (The Choice)**:
  * 弹出 3 张卡片，内容源自 `BuffSystem` 或 `NumericModifier`。
  * *示例*:
        1. **[兵源补充]**: 全军生命值恢复 100%。
        2. **[锋利刀刃]**: 我方物理攻击 +20% (Modifier)。
        3. **[奥术涌动]**: 英雄技能 CD -30%。
* **玩家操作**: 点击一张卡片 -> `ApplyEffect()` -> `CurrentStage++` -> `RestartGame()` (触发死亡屏障流程)。

### Phase 3: 演示结束 (Demo End)

* 当完成 `Stage 4` 并点击继续后：
* **最终画面**:
  * 背景虚化，弹出一封“致开发者/玩家的信”。
  * **内容**:
        > "感谢体验 SoulMaster 技能系统演示。"
        > "本作旨在展示 Unity 6 双世界架构、Zenject 依赖注入、以及高性能模块化技能系统的技术落地。"
        > "所有的战斗逻辑、AI 决策均在 Server 模拟层运行。"
        > "如果您对架构感兴趣，或有合作意向，请留言。"
  * **按钮**: [退出游戏] 或 [再来一轮 (Reset All)]。
  * *注意*: 不返回所谓“大厅”，保持纯粹的技术展示感。

## 3. 关键数据结构 (Data Structures)

### 3.1 GameScope (Zenject)

需要一个 `GameFlowManager` (Singleton) 来维护全局状态：

```csharp
public class GameFlowManager {
    public int CurrentStageIndex { get; private set; } = 0;
    public CommanderData PlayerCommander { get; set; }
    // ...
}
```

### 3.2 Roguelite 配置

```csharp
[Serializable]
public class RogueliteOption {
    public string Title;
    public string Description;
    public List<NumericModifierData> Modifiers; // 对应我们的 Numeric 系统
    public bool IsHeal; // 特殊逻辑
}
```
