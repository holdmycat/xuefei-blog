---
title: "数值系统架构详解：属性修改器与广播机制"
date: 2026-01-01T10:55:00+08:00
draft: false
tags: ["Architecture", "SLG", "Numeric System", "Design Pattern"]
---

# 数值系统与属性修改器架构设计 (Numeric System Architecture)

## 1. 问题背景 (Problem)

在大型 SLG/RPG 游戏中，数值系统（Numeric System）是角色的核心驱动力。随着游戏逻辑的复杂化，我们面临以下挑战：

* **属性来源复杂**：角色的最终属性（Final Attribute）由 基础值（Base）、装备加成、科技加成、指挥官 Buff、临时状态（Buff/Debuff）共同决定。
* **计算顺序与依赖**：如何正确处理“基础值提升”、“固定值增加”、“百分比加成”之间的计算优先级？
* **动态性与溯源**：当属性发生变化时，如果仅仅修改一个最终值，不仅无法还原（Reset），也无法得知是哪个模块导致了变化（Debug 困难）。
* **多层级联动**：在 SLG 中，指挥官（Commander）的属性变化需要实时广播给麾下的所有方阵（Squad），形成“一人穿装，全军受益”的效果。

## 2. 之前的逻辑与痛点 (Previous Logic)

早期的设计可能直接操作 `Add` 值：

```csharp
// 错误示例：直接修改 Add 值
squad.NumericComponent[eNumericType.AttackAdd] += 100;
```

这种做法的缺陷在于：

1. **不可逆**：如果 Buff 过期了，需要手动减去 100。如果逻辑复杂，很容易减错或漏减。
2. **堆叠混乱**：多个来源（装备、科技）如果同时修改同一个值，很难区分谁贡献了多少。
3. **计算公式隐晦**：`Final = Base + Add`。如果 `Add` 是由外部随意修改的，那么系统内部就失去了对“最终值是如何计算出来”的控制权。

## 3. 解决方案：属性修改器架构 (Modifier Architecture)

我们设计了一套基于 **基础值 (Base) + 修改器 (Modifier) -> 最终值 (Final)** 的响应式架构。

### 3.1 核心概念：Base, Add, Final

为了兼顾表现层（UI显示基础+加成）和逻辑层（使用最终值），我们将每个属性拆分为三个 ID：

* **Final (ID: X)**: 最终参与战斗计算的数值。
* **Base (ID: X*10 + 1)**: 角色的白字属性（由等级、初始数据决定）。
* **Add (ID: X*10 + 2)**: 绿字属性（额外加成）。

**关键逻辑**：

* **禁止外部直接修改 Add**。
* **外部只允许修改 Base**（升级）或 **添加/移除 Modifier**（Buff）。
* **系统自动计算 Final**，并反推 `Add = Final - Base` 以供 UI 显示。

### 3.2 属性修改器 (Attribute Modifier)

我们引入了 `ADataModifier` 类来封装所有对属性的修改操作。

```csharp
public abstract class ADataModifier : IReference
{
    public abstract ModifierType ModifierType { get; } // Constant (固定值) 或 Percentage (百分比)
    public abstract float GetModifierValue();
    public abstract void Clear();
}
```

* **ModifierType.Constant**: 直接增加数值（如：装备提供 +100 攻击）。
* **ModifierType.Percentage**: 百分比加成（如：科技提供 +5% 攻击）。

### 3.3 计算管线 (Calculation Pipeline)

在 `BaseNumericComponent.RecalculateModifiers` 中实现了标准的 SLG 属性计算公式：

$$Final = (Base + \sum Constant) \times (1 + \sum Percentage)$$

代码实现：

```csharp
public void RecalculateModifiers(eNumericType numericType)
{
    // 1. 获取基础值
    float baseValue = GetByKey(baseTypeId);
    
    // 2. 累加所有 Modifier
    float constantSum = 0f;
    float percentageSum = 0f;
    foreach (var mod in list) {
        if (mod.Type == Constant) constantSum += mod.Value;
        else if (mod.Type == Percentage) percentageSum += mod.Value;
    }
    
    // 3. 计算最终值
    float finalValue = (baseValue + constantSum) * (1 + percentageSum);
    
    // 4. 更新 Final (系统会自动更新 Add)
    this[numericType] = finalValue; 
}
```

### 3.4 广播机制 (Broadcast Logic)

为了实现 Commander -> Squad 的联动，我们使用了 **观察者模式 (Observer Pattern)**。

1. **事件源**：`BaseNumericComponent` 暴露 `OnValueChanged` 事件。任何属性（Base/Final）变化都会触发。
2. **监听者**：`SquadNumericComponent` 在初始化时订阅其归属 Commander 的 `OnValueChanged`。
3. **响应**：当 Commander 属性变化（如穿装备导致 `InfantryAttackMod` 增加），Squad 收到通知，立即更新自身的 `Modifier` 并重新计算。

```csharp
// SquadNumericComponent.cs
private void OnCommanderNumericChanged(eNumericType type, float value)
{
    // 收到指挥官属性变化，刷新自身的 Buff Modifier
    RecalculateStatsFromCommander();
}

private void RecalculateStatsFromCommander()
{
    // 获取指挥官的加成值
    float modValue = _commanderContext.NumericComponent[eNumericType.InfantryAttackMod];
    
    // 转换为百分比修改器 (0.05f)
    float factor = modValue / 10000f;
    
    // 更新或创建 Modifier
    if (_comAttackMod != null) {
        _comAttackMod.UpdateValue(factor);
        RecalculateModifiers(eNumericType.Attack); // 触发重算
    } else {
        // ... 创建新 Modifier
    }
}
```

## 4. 设计模式的使用 (Design Patterns)

本系统综合运用了多种设计模式来保证扩展性和可维护性：

1. **模板方法模式 (Template Method)**:
    * `BaseNumericComponent` 定义了 `Initialize`, `UpdateNumeric`, `Dispose` 的骨架。
    * `SquadNumericComponent` 和 `CommanderNumericComponent` 只需重写 `OnInitialize`, `OnLevelUp` 等特定步骤，无需关心底层字典管理。

2. **策略模式 (Strategy Pattern) 的变体**:
    * `ADataModifier` 充当策略接口。不同的修改器（固定/百分比）代表不同的计算策略，BaseComponent 无需硬编码计算逻辑，而是遍历策略列表。

3. **观察者模式 (Observer Pattern)**:
    * 用于解决 Commander 与 Squad 之间的解耦通信。Squad 依赖 Commander 的数据抽象（Context），而非具体实现细节，通过事件驱动更新。

4. **组合模式 (Composite Pattern) 思想**:
    * 修改器列表 (`List<ADataModifier>`) 可以被视为一种组合，系统统一对待单个修改器和修改器集合的计算结果。

## 5. 总结 (Summary)

这套架构带来的收益：

1. **数据流清晰**：Base 是源头，Modifier 是过程，Final 是结果。UI 永远显示正确的数据。
2. **高可维护性**：Buff 逻辑被封装在 Modifier 对象中，移除去引用池即可，无需手动做减法运算，杜绝了“Buff 移除后属性不对”的 Bug。
3. **SLG 业务适配**：完美支持指挥官对兵种的全局加成，且支持动态热更（Commander 变强，兵立刻变强）。
