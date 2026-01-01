---
title: "Numeric System Architecture: Modifiers and Broadcast Mechanism"
date: 2026-01-01T10:55:00+08:00
draft: false
tags: ["Architecture", "SLG", "Numeric System", "Design Pattern"]
---

# Numeric System and Attribute Modifier Architecture Design

## 1. Problem Background

In large-scale SLG/RPG games, the **Numeric System** is the core driver of character performance. As game logic becomes increasingly complex, we face several challenges:

* **Complex Attribute Sources**: A character's **Final Attribute** is determined by a combination of Base Value, Equipment Bonuses, Tech Bonuses, Commander Buffs, and temporary States (Buffs/Debuffs).
* **Calculation Order & Dependencies**: How to correctly handle the calculation priority between "Base Value Growth", "Flat Value Addition", and "Percentage Bonuses"?
* **Dynamism & Traceability**: When an attribute changes, simply modifying the final value makes it impossible to **Reset** correctly or track **Source** (i.e., which module caused the change), making debugging difficult.
* **Multi-Hierarchy Linkage**: In SLG games, changes in **Commander** attributes need to be broadcast in real-time to all subordinate **Squads**, creating an effect where "One person gears up, the whole army benefits."

## 2. Previous Logic & Pain Points

Early designs might have directly manipulated the `Add` value:

```csharp
// BAD EXAMPLE: Directly modifying the Add value
squad.NumericComponent[eNumericType.AttackAdd] += 100;
```

The flaws of this approach are:

1. **Irreversibility**: If the Buff expires, you must manually subtract 100. In complex logic, it's easy to subtract incorrectly or forget to subtract entirely.
2. **Stacking Chaos**: If multiple sources (Equipment, Tech) modify the same value simultaneously, it becomes difficult to distinguish who contributed what.
3. **Obscured Formula**: `Final = Base + Add`. If `Add` is modified arbitrarily from the outside, the system loses control over "how calculation of the final value occurs."

## 3. Solution: Attribute Modifier Architecture

We designed a reactive architecture based on **Base + Modifiers -> Final**.

### 3.1 Core Concepts: Base, Add, Final

To balance the presentation layer (UI displaying Base + Bonus) and the logic layer (using Final Value), we split each attribute into three IDs:

* **Final (ID: X)**: The actual value used in combat calculations.
* **Base (ID: X*10 + 1)**: The character's white stats (determined by Level, Initial Data).
* **Add (ID: X*10 + 2)**: The green stats (Extra Bonuses).

**Key Logic**:

* **Prohibit external direct modification of `Add`**.
* **Externally only allow modification of `Base`** (Level Up) or **Add/Remove `Modifier`** (Buffs).
* **System automatically calculates `Final`**, and reverse-derives `Add = Final - Base` for UI display.

### 3.2 Attribute Modifier

We introduced the `ADataModifier` class to encapsulate all attribute modification operations.

```csharp
public abstract class ADataModifier : IReference
{
    public abstract ModifierType ModifierType { get; } // Constant or Percentage
    public abstract float GetModifierValue();
    public abstract void Clear();
}
```

* **ModifierType.Constant**: Adds a flat value (e.g., Equipment provides +100 Attack).
* **ModifierType.Percentage**: Adds a percentage bonus (e.g., Tech provides +5% Attack).

### 3.3 Calculation Pipeline

The standard SLG attribute calculation formula is implemented in `BaseNumericComponent.RecalculateModifiers`:

$$Final = (Base + \sum Constant) \times (1 + \sum Percentage)$$

Implementation:

```csharp
public void RecalculateModifiers(eNumericType numericType)
{
    // 1. Get Base Value
    float baseValue = GetByKey(baseTypeId);
    
    // 2. Accumulate all Modifiers
    float constantSum = 0f;
    float percentageSum = 0f;
    foreach (var mod in list) {
        if (mod.Type == Constant) constantSum += mod.Value;
        else if (mod.Type == Percentage) percentageSum += mod.Value;
    }
    
    // 3. Calculate Final Value
    float finalValue = (baseValue + constantSum) * (1 + percentageSum);
    
    // 4. Update Final (System automatically updates Add)
    this[numericType] = finalValue; 
}
```

### 3.4 Broadcast Mechanism

To implement the **Commander -> Squad** linkage, we utilized the **Observer Pattern**.

1. **Event Source**: `BaseNumericComponent` exposes an `OnValueChanged` event. Any attribute change (Base/Final) triggers it.
2. **Listener**: `SquadNumericComponent` subscribes to its owning Commander's `OnValueChanged` during initialization.
3. **Response**: When Commander attributes change (e.g., putting on gear increases `InfantryAttackMod`), the Squad receives the notification, immediately updates its own `Modifier`, and recalculates.

```csharp
// SquadNumericComponent.cs
private void OnCommanderNumericChanged(eNumericType type, float value)
{
    // Received Commander attribute change, refresh own Buff Modifier
    RecalculateStatsFromCommander();
}

private void RecalculateStatsFromCommander()
{
    // Fetch Commander's Bonus Value
    float modValue = _commanderContext.NumericComponent[eNumericType.InfantryAttackMod];
    
    // Convert to percentage modifier (0.05f)
    float factor = modValue / 10000f;
    
    // Update or Create Modifier
    if (_comAttackMod != null) {
        _comAttackMod.UpdateValue(factor);
        RecalculateModifiers(eNumericType.Attack); // Trigger Recalculation
    } else {
        // ... Create new Modifier
    }
}
```

## 4. Design Patterns Used

This system integrates multiple design patterns to ensure extensibility and maintainability:

1. **Template Method Pattern**:
    * `BaseNumericComponent` defines the skeleton of `Initialize`, `UpdateNumeric`, and `Dispose`.
    * `SquadNumericComponent` and `CommanderNumericComponent` only need to override specific steps like `OnInitialize` and `OnLevelUp`, without managing the underlying dictionary logic.

2. **Strategy Pattern (Variation)**:
    * `ADataModifier` acts as the strategy interface. Different modifiers (Constant/Percentage) represent different calculation strategies. The BaseComponent iterates through the strategy list without hardcoding calculation logic.

3. **Observer Pattern**:
    * Used to decouple communication between Commander and Squad. The Squad depends on the Commander's data abstraction (Context) rather than specific implementation details, driving updates via events.

4. **Composite Pattern Idea**:
    * The list of modifiers (`List<ADataModifier>`) can be treated as a composite, where the system uniformly handles the calculation results of single modifiers and collections of modifiers.

## 5. Summary

Benefits of this architecture:

1. **Clear Data Flow**: Base is the Source, Modifier is the Process, Final is the Result. The UI always displays correct data.
2. **High Maintainability**: Buff logic is encapsulated in Modifier objects. Removing a Buff is as simple as removing the object and releasing it to the pool, eliminating "Attribute incorrect after Buff removal" bugs.
3. **SLG Business Adaptation**: Perfectly supports global Commander bonuses for unit types and supports dynamic hot updates (Commander gets stronger -> Units immediately get stronger).
