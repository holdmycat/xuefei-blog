---
title: "SLG Numeric Architecture Analysis: Case Study of Whiteout Survival"
date: 2025-12-26T14:15:00+08:00
draft: false
categories: ["System Design", "SLG"]
tags: ["Architecture", "Numeric System", "Whiteout Survival"]
---

# SLG Numeric Architecture Analysis (Based on Whiteout Survival Model)

## 1. Background

When designing the `SquadNumericComponent` for `ServerSquad`, we need to determine whether similar numeric components are required at the `Commander` and `Legion` levels. Reference to the industry benchmark "Whiteout Survival" (WOS) and typical COK-like architectures provides the following analysis.

## 2. Hierarchical Architecture & Numeric Flow

In a typical SLG (Strategy Game), numeric values are not flat but exhibit a **Cascading** characteristic across hierarchy levels.

### 2.1 Commander Level (Global)

**Role**: Global Attribute Provider.
**Data Sources**:

- **Tech**: Attack/Defense/HP bonuses for unit types.
- **Gear/Chief Gear**: Global bonuses provided by commander equipment.
- **Talents**: Commander talent tree.
- **Alliance Tech**: Global buffs provided by the alliance.
- **VIP/Skins/Decorations**: Passive global attributes.

**Numeric Component Needed?**: **[MUST]**

- **Reasoning**: The numeric component here is not responsible for specific "combat" calculations but for **Aggregating** all global bonuses.
- **Structure Example**: `Dictionary<AttrType, float> GlobalBuffs`.
- **Function**: When a Legion departs or enters combat, it first takes a "Snapshot" of the Commander's numeric component to obtain the current base bonuses.

### 2.2 Legion Level (March Queue)

**Role**: March Context & Hero Container.
**Data Sources**:

- **Heroes**: Skills and passive attributes of leading heroes (in WOS, heroes determine march capacity and specific unit bonuses).
- **March Items**: Atk/Def boost items (e.g., 24h Buffs).
- **Tile/Territory Buffs**: Bonuses for fighting on alliance territory.
- **March Attributes**: Unique **March Speed**, **Load**, and **Stamina**.

**Numeric Component Needed?**: **[MUST]**

- **Reasoning**:
    1. It is the logical entity for **March Speed** and **Load**.
    2. It serves as the middleware connecting Commander global attributes and specific Squad attributes.
    3. It handles dynamic bonuses from "Heroes" (e.g., Hero A gives Infantry Atk +20%).

### 2.3 Squad Level (Unit Formulation)

**Role**: Combat Entity.
**Data Sources**:

- **Base Stats**: Determined by Unit Tier (e.g., T1 vs T10).
- **Counter Relationships**: Infantry counters Marksman, etc. (calculated dynamically during combat).
- **Real-time State**: **CurrentCount**.

**Numeric Component Needed?**: **[MUST]**

- **Reasoning**:
    1. **HP Management**: In SLG, Unit Count = HP. We need to maintain `CurrentCount` / `MaxCount`.
    2. **Final Stat Calculation**: `FinalAtk = BaseAtk * (1 + CmdBuff + LegionBuff) + FlatBonus`.
    3. **Combat Buffs**: Temporary Buffs/Debuffs received during the battle loop.

## 3. Whiteout Survival Reference Model Summary

In WOS gameplay:

1. **Furnace Level** caps your overall development.
2. **Heroes** are the combat core; they provide stats and cast RPG-style skills (in Expedition modes).
3. **Units**: Only three types exist: Infantry (Shield), Lancer (Spear), Marksman (Bow).

**Architecture Recommendation**:

| Level | Component Name Proposal | Core Responsibility | R/W Frequency |
| :--- | :--- | :--- | :--- |
| **Commander** | `CommanderStatsComponent` | Maintains `%` bonus pools from Tech, Gear, VIP. | **Low Write, High Read** (Reads on every march/battle) |
| **Legion** | `LegionStatsComponent` | Maintains **Speed**, **Load**; Aggregates Hero bonuses. | **Medium** (Created on March, modifies on speedup) |
| **Squad** | `SquadNumericComponent` | Maintains **CurrentCount**; Calculates final Atk/Def/HP. | **High** (Real-time damage/state changes) |
