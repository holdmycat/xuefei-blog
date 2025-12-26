---
title: "SLG数值架构分析：以Whiteout Survival为例"
date: 2025-12-26T14:15:00+08:00
draft: false
categories: ["System Design", "SLG"]
tags: ["Architecture", "Numeric System", "Whiteout Survival"]
---

# SLG数值架构分析 (Based on Whiteout Survival Model)

## 1. 问题背景

在设计 `ServerSquad` 的 `SquadNumericComponent` 时，我们需要确定是否也需要在 `Commander`（领主）和 `Legion`（部队/队列）层级设计对应的数值组件。参考业界标杆《Whiteout Survival》（无尽冬日）及主流COK-like架构，我们进行如下分析。

## 2. 层级架构与数值流向

在典型的SLG中，数值并非扁平的，而是呈现**层级传导（Cascading）**的特征。

### 2.1 Commander (领主/全局层)

**定位**: 全局属性提供者 (Global Attribute Provider)。
**数据来源**:

- **科技 (Tech)**: 兵种攻击/防御/生命加成。
- **装备 (Gear/Chief Gear)**: 领主装备提供的全局加成。
- **天赋 (Talents)**: 领主天赋树。
- **联盟科技 (Alliance Tech)**: 联盟提供的全局Buff。
- **VIP/皮肤/装饰物**: 被动生效的全局属性。

**是否需要 NumericComponent?**: **[必须]**

- **理由**: 这里的数值组件不负责具体的“战斗”，而是负责**聚合 (Aggregate)** 所有全局加成。
- **结构示例**: `Dictionary<AttrType, float> GlobalBuffs`。
- **作用**: 当一支部队（Legion）出发或进入战斗时，首先要对Commander的数值组件进行“快照 (Snapshot)”，获取当前的基础加成。

### 2.2 Legion (部队/出征队列层)

**定位**: 行军上下文与英雄载体 (March Context & Hero Container)。
**数据来源**:

- **英雄 (Heroes)**: 带队英雄的技能、被动属性（在WOS中，英雄决定了带兵上限和特定的兵种加成）。
- **行军道具**: 攻击/防御增益道具（24小时Buff）。
- **地块/领土Buff**: 在盟地作战的加成。
- **行军属性**: 独特的**行军速度 (March Speed)**、**负重 (Load)**、**体力 (Stamina)**。

**是否需要 NumericComponent?**: **[必须]**

- **理由**:
    1. 它是**行军速度**和**负重**的逻辑实体。
    2. 它是连接Commander全局属性和Squad具体属性的中间层。
    3. 它需要处理“英雄”带来的动态加成（例如：某英雄让步兵攻击+20%）。

### 2.3 Squad (士兵/方阵层)

**定位**: 战斗实体 (Combat Entity)。
**数据来源**:

- **兵种基础属性 (Base Stats)**: 由Tier（等级）决定（如T1 vs T10）。
- **克制关系**: 步兵克弓兵等（战斗时动态计算）。
- **实时状态**: 当前存活数量 (CurrentCount)。

**是否需要 NumericComponent?**: **[必须]**

- **理由**:
    1. **生命值管理**: 在SLG中，兵量=血量。需要维护 `CurrentCount` / `MaxCount`。
    2. **最终属性计算**: `FinalAtk = BaseAtk * (1 + CmdBuff + LegionBuff) + FlatBonus`。
    3. **战斗Buff**: 战斗过程中受到的临时Buff/Debuff。

## 3. 《Whiteout Survival》参考模型总结

在WOS的具体玩法中：

1. **火种/熔炉 (Furnace)** 等级限制了你的整体发展上限。
2. **英雄 (Heroes)** 是战斗核心，他们不仅提供数值，还释放RPG式的技能（在远征副本中）。
3. **兵种**: 只有盾兵（Infantry）、矛兵（Lancer）、射手（Marksman）三种。

**架构建议**:

| 层级 | 组件名称建议 | 核心职责 | 数据读写频率 |
| :--- | :--- | :--- | :--- |
| **Commander** | `CommanderStatsComponent` | 维护科技、装备、VIP带来的 `%` 加成池。 | **低频写，高频读** (每次出兵/战斗时读) |
| **Legion** | `LegionStatsComponent` | 维护**行军速度**、**负重**；聚合英雄属性加成。 | **中频** (出兵时生成，行军中可能变如加速) |
| **Squad** | `SquadNumericComponent` | 维护**当前兵量** (CurrentCount)；计算最终攻防血。 | **高频** (战斗中实时扣血/结算) |
