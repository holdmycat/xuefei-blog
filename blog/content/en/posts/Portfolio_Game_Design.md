---
title: "Mini-SoulMaster: Technical Demo Design"
date: 2026-01-08T15:00:00+08:00
draft: false
tags: ["GameDesign", "Roguelite", "Portfolio", "Architecture"]
---

# Portfolio Mini-Game Design: "Mini-SoulMaster" (Roguelite Loop)

**Document Goal**: Define the complete flow of a 5-stage Roguelite demo game based on the `Modular-Skill-System-Demo`, and validate it against the [SLG Main Programmer Project Filter]( {{< ref "SLG_MainProgrammer_Filter_2025.md" >}} ).

## 1. Filter Validation

| Filter Dimension | Verdict | Rationale |
| :--- | :--- | :--- |
| **D1. Auto Combat** | ✅ | Core gameplay is dual-world auto-combat; player strategy is pre-battle only. |
| **D2. Pre-battle Config** | ✅ | The "Pick 1 of 3" upgrade before each stage is the sole strategic point. |
| **D3. Clear Win/Loss** | ✅ | 5 stages, fast-paced, no attrition warfare. |
| **D4. Numeric/Visual** | ✅ | Showcases massive stat boosts and VFX using the Skill/Buff system. |
| **D5. Ad-Ready** | ✅ | Each stage is an independent "combat slice". |
| **D6. Low Failure Rate** | ✅ | **Design Modification**: Rewards and progression are granted regardless of win/loss, eliminating frustration. |
| **D7. Structure Multiplier** | ✅ | Reuses the same Numeric/Modifier architecture throughout. |
| **T1-T8 Technical** | ✅ | Reuses existing frameworks (ShowCase, Commander, FSM, Pool). |

**Conclusion**: This project fully aligns with the "SLG Main Programmer Capability Proof" positioning and is suitable for rapid release.

## 2. Game Flow

The game features no traditional Lobby, adopting a "Linear Roguelite" structure.

### Phase 1: Boot & Guide

* **Boot**: Enter `UIScene_ShowCaseScene` (rename to `GameScene`?).
* **Guide (Tutorial UI)**:
  * Full-screen overlay + simple text: "Welcome to the SoulMaster Skill System Demo".
  * **Step 1**: Select Hero (offer 2 presets: *Melee/Phys* vs *Range/Magic*).
  * **Step 2**: Confirm Squad (default configuration, no complex ops).
  * **Action**: Click "Start Demo".

### Phase 2: Battle Loop (5 Stages)

Total of 5 stages, indexed `Stage 0` to `Stage 4`.

#### A. Battle Phase - "Whiteout Survival" Style

* **Core Mechanics**:
  * **Formation**: Front Row takes damage (Tank), Back Row deals damage/supports (DPS/Support).
  * **Commander & Legion**: Commanders lead Legions into battle.
  * **Energy & Skills**: Commanders accumulate **Energy** via attacking/taking damage. Ultimate Skills auto-cast when Energy is full.
  * **Auto-Targeting**: Combat is purely AI-driven based on aggro/position. Player **cannot manually cast skills**.
* **Win/Loss Condition**:
  * **Time Limit**: Fail if enemy is not wiped out within 90s.
  * **Wipe Out**: All units of one side reach 0 HP.
* **Flow**:
  * Countdown -> Entry/Spawn -> Auto-Battle -> Slow Motion Finish -> Settlement.
  * Proceed to [B. Result Phase] regardless of result (Roguelite rule adjustment).

#### B. Result & Upgrade

* **Result Popup**:
  * Title: "Battle Finished".
  * Description: "Loading next simulation data...".
* **Roguelite Choice (Pick 1 of 3)**:
  * Pop up 3 cards, content derived from `BuffSystem` or `NumericModifier`.
  * *Examples*:
        1. **[Reinforcements]**: Restore 100% HP to all units.
        2. **[Sharp Edge]**: Ally Physical Attack +20% (Modifier).
        3. **[Arcane Surge]**: Hero Skill CD -30%.
* **Player Action**: Click a card -> `ApplyEffect()` -> `CurrentStage++` -> `RestartGame()` (trigger Death Barrier flow).

### Phase 3: Demo End

* After completing `Stage 4` and clicking continue:
* **Final Screen**:
  * Blurred background, pop up a "Letter to Developers/Players".
  * **Content**:
        > "Thank you for experiencing the SoulMaster Skill System Demo."
        > "This project demonstrates the technical implementation of Unity 6 Dual-World Architecture, Zenject DI, and a High-Performance Modular Skill System."
        > "All combat logic and AI decisions run on the Server Simulation Layer."
        > "If you are interested in the architecture or collaboration, please leave a comment."
  * **Buttons**: [Exit Game] or [Restart Run (Reset All)].
  * *Note*: No return to a so-called "Lobby", maintaining a pure technical showcase feel.

## 3. Key Data Structures

### 3.1 GameScope (Zenject)

Need a `GameFlowManager` (Singleton) to maintain global state:

```csharp
public class GameFlowManager {
    public int CurrentStageIndex { get; private set; } = 0;
    public CommanderData PlayerCommander { get; set; }
    // ...
}
```

### 3.2 Roguelite Config

```csharp
[Serializable]
public class RogueliteOption {
    public string Title;
    public string Description;
    public List<NumericModifierData> Modifiers; // Maps to our Numeric System
    public bool IsHeal; // Special logic
}
```
