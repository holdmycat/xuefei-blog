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

### 2.1 Art Resource Requirements

To balance visual quality and development cost, we adopt a **Minimalist Asset Strategy**:

| Category | Role | Position/Description | Qty |
| :--- | :--- | :--- | :--- |
| **Commanders** | **Shield Guard** | **Front Row**. High HP, Shield/Taunt skills. | 1 |
| | **Archer** | **Back Row**. High single-target DMG, physical projectiles. | 1 |
| | **Mage** | **Back Row**. AOE DMG, flashy VFX. | 1 |
| **Legions** | **Shield Bearers** | Matches Front Row defense. | 1 |
| | **Cav/Spearmen** | Matches Assault. | 1 |
| | **Archers** | Matches Back Row DPS. | 1 |
| **Monsters** | **Minion (Melee)** | Swarm, fodder (e.g., Imp). | 1 |
| | **Ranged (Ranged)** | Pressure back row (e.g., Thrower). | 1 |
| | **Boss** | **Stage 5 Only**. Large model, cool animations (e.g., Troll). | 1 |
| **Total** | | **3 Commanders + 3 Legions + 3 Monsters = 9 Models** | **9** |

*Note: If resources are scarce, Monster models can reuse Legion models with red tinting/VFX.*

### 2.2 Scene Art Requirements

Based on visual references (Whiteout Survival style), the scene requires a **Low Poly**, **Cold Tone** snowy battlefield.

| Name | Description | Est. Tris |
| :--- | :--- | :--- |
| **Terrain_SnowBase** | **Snow Base**. Main ground with undulations and snow texture. | 500 - 1000 |
| **Terrain_DirtPath** | **Dirt Path**. S-shaped or straight path cutting through the snow. | 200 - 400 |
| **Env_Cliff_01** | **Snow Cliff**. Low poly faceted geometry to block map edges. | 300 - 600 |
| **Env_Tree_Pine_Snow** | **Snowy Pine**. Main vegetation, layered foliage, varying sizes (L/M/S). | 300 - 500 |
| **Env_Tree_Dead** | **Dead Tree**. Leafless trunk, adds desolation. | 150 - 300 |
| **Env_Bush_Snow** | **Snowy Bush**. Small ground cover vegetation. | 50 - 100 |
| **Env_Rock_Group** | **Rock Cluster**. Scattered rocks of varying sizes. | 100 - 200 |
| **VFX_Snow_Drift** | **Snow Particle**. Global particle effect for atmosphere. | (Particle) |
| **VFX_Fog_Plane** | **Fog Plane**. Translucent planes to hide map edges. | 2 - 10 |

**Style Requirements**:

- **Material**: Flat Color or Simple Gradient. No complex normal/specular maps.
- **Palette**: White, Pale Blue-Grey, Dark Brown (Trees), Earthy Yellow (Path).

### Phase 1: Boot & Guide

- **Boot**: Enter `UIScene_ShowCaseScene` (rename to `GameScene`?).
- **Guide (Tutorial UI)**:
  - Full-screen overlay + simple text: "Welcome to the SoulMaster Skill System Demo".
  - **Step 1**: Select Hero (offer 2 presets: *Melee/Phys* vs *Range/Magic*).
  - **Step 2**: Confirm Squad (default configuration, no complex ops).
  - **Action**: Click "Start Demo".

### Phase 2: Battle Loop (5 Stages)

Total of 5 stages, indexed `Stage 0` to `Stage 4`.

#### A. Battle Phase - "Whiteout Survival" Style

- **Core Mechanics**:
  - **Formation**: Front Row takes damage (Tank), Back Row deals damage/supports (DPS/Support).
  - **Commander & Legion**: Commanders lead Legions into battle.
  - **Energy & Skills**: Commanders accumulate **Energy** via attacking/taking damage. Ultimate Skills auto-cast when Energy is full.
  - **Auto-Targeting**: Combat is purely AI-driven based on aggro/position. Player **cannot manually cast skills**.
- **Win/Loss Condition**:
  - **Time Limit**: Fail if enemy is not wiped out within 90s.
  - **Wipe Out**: All units of one side reach 0 HP.
- **Flow**:
  - Countdown -> Entry/Spawn -> Auto-Battle -> Slow Motion Finish -> Settlement.
  - Proceed to [B. Result Phase] regardless of result (Roguelite rule adjustment).

#### B. Result & Upgrade

- **Result Popup**:
  - Title: "Battle Finished".
  - Description: "Loading next simulation data...".
- **Roguelite Choice (Pick 1 of 3)**:
  - Pop up 3 cards, content derived from `BuffSystem` or `NumericModifier`.
  - *Examples*:
        1. **[Reinforcements]**: Restore 100% HP to all units.
        2. **[Sharp Edge]**: Ally Physical Attack +20% (Modifier).
        3. **[Arcane Surge]**: Hero Skill CD -30%.
- **Player Action**: Click a card -> `ApplyEffect()` -> `CurrentStage++` -> `RestartGame()` (trigger Death Barrier flow).

### Phase 3: Demo End

- After completing `Stage 4` and clicking continue:
- **Final Screen**:
  - Blurred background, pop up a "Letter to Developers/Players".
  - **Content**:
        > "Thank you for experiencing the SoulMaster Skill System Demo."
        > "This project demonstrates the technical implementation of Unity 6 Dual-World Architecture, Zenject DI, and a High-Performance Modular Skill System."
        > "All combat logic and AI decisions run on the Server Simulation Layer."
        > "If you are interested in the architecture or collaboration, please leave a comment."
  - **Buttons**: [Exit Game] or [Restart Run (Reset All)].
  - *Note*: No return to a so-called "Lobby", maintaining a pure technical showcase feel.

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
