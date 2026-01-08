---
title: "Game Loop & Death Barrier Architecture"
date: 2026-01-08T09:58:00+08:00
draft: false
tags: ["Architecture", "System Design", "Unity", "GameLoop"]
---

# Game Loop & Death Barrier Architecture

This document describes the core game loop flow (Start -> End -> Restart), with a focus on the **Death Barrier** mechanism introduced during the "Restart" process to resolve conflicts between asynchronous recycling and revival logic.

## 1. Core Problem

When implementing the "Restart" function, directly reviving objects can lead to state pollution due to:

- **Asynchronous Death**: Death logic often involves asynchronous processes (death animations, VFX delays, cleanup logic) that do not complete immediately.
- **State Conflict**: If some Squads are still executing death visuals while the revival logic begins to reset data and start behavior trees, it causes discrepancies between visuals (presentation layer) and logic (logic layer), or even errors.

**Solution**: Introduce a "Death Barrier" to forcibly divide the process into mutually exclusive stages.

## 2. Complete Flow Design

### Phase A: Initial Start

1. **Initialization**:
    - Server/Client creates all Squads.
    - Behavior Trees start (`Start()`).
2. **Readiness Check**:
    - When client behavior trees enter the `Idle` state, a **"All Squads Ready"** event is triggered via broadcast.
3. **UI Intervention**:
    - `UIScene_ShowCaseScene` captures this event and pops up the **"Start Battle"** button.
    - User clicks start, triggering the battle state flow.

---

### Phase B: Restart Loop

When the game ends and the user clicks "Restart", the following strict sequence is executed:

#### 1. Trigger Round End

- System broadcasts "Round End" signal.
- All **Alive** Squads are forced into **Death Logic**:
  - FSM switches to `Death` state.
  - Play death animation/VFX.
  - Execute data cleanup.

#### 2. Death Barrier - **Key Point**

- System enters **"Waiting for Cleanup"** state.
- Each Squad reports **"Death Complete"** via callback after finishing its death logic (including asynchronous animations).
- `Commander` or `GameManager` counts the completed deaths.
- **Blocking Condition**: Access to the next phase is denied until **ALL** Squads have reported completion.

#### 3. Revival Phase

- Barrier lifts, enter revival flow:
  - **Reset Data**: Clear FSM state, clear temporary Blackboard data.
  - **Reset Position**: Move Squads back to spawn points.
  - **Restart AI**: Re-attach/Start behavior trees (`Start()`).

#### 4. UI Restoration

- Client detects all Squads entering `Idle` again.
- Re-popups **"Start Battle"** UI, completing the loop.

## 3. Implementation Details

### 3.1 Death Completion Event

Each Squad needs to expose a callback or event, for example:

```csharp
public event Action OnDeathProcessComplete;
// Triggered at the Exit of Death State or animation end callback
```

### 3.2 Barrier Logic

Implement a counter or list check in the manager class:

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
        StartRevivalPhase(); // Barrier lifted
    }
}
```

### 3.3 Revival Cleanup

Revival is not just `SetActive(true)`; it must include deep state reset:

- Stop currently running behavior trees (prevent residual Tasks from executing).
- Clear leftover Targets/States in the Blackboard from the previous round.
- Reset FSM to Default State.

## 4. Conclusion

By introducing the "Death Barrier", we forcibly separate the potentially overlapping periods of "Destruction" and "Reconstruction", ensuring that every "Restart" begins in a clean, deterministic memory and logical state.
