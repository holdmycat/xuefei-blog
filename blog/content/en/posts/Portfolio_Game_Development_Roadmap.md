---
title: "Mini-SoulMaster: 8-Week Development Roadmap"
date: 2026-01-08T16:00:00+08:00
draft: false
tags: ["Roadmap", "ProjectManagement", "IndieDev"]
---

# Portfolio Game Development Roadmap (8-Week Plan)

**Total Duration**: Jan 08, 2026 - Mar 05, 2026 (Estimated)
**Goal**: Complete "Mini-SoulMaster" (Whiteout Survival Like) Portrait Demo and launch on TapTap for technical and design validation.

---

## 📅 Timeline

### Phase 1: Infrastructure & Core Refactor (Week 1-2)
>
> **Focus**: Tech foundation, Portrait mode, Hotfix architecture

* **Week 1 (01/08 - 01/14)**: **Infrastructure Week**
  * [ ] **Portrait Refactor**: Adjust Camera FOV, refactor Battle UI for Portrait (9:16) layout.
  * [ ] **HybridCLR**: Integrate HybridCLR, separate AOT/Hotfix assemblies, verify code hotfix flow.
  * [ ] **Addressables/CDN**: Establish asset management standards, configure simulated CDN loading.
* **Week 2 (01/15 - 01/21)**: **Combat Loop Week**
  * [ ] **Combat Logic**: Implement "Energy-Ultimate", "Front/Back Row Aggro" logic.
  * [ ] **Roguelite Framework**: Implement 5-stage loop and simple "Pick 1 of 3" data structure.
  * [ ] **Art Pipeline**: Define asset import standards, start producing whitebox/initial art assets.

### Phase 2: Subsystems & Interaction (Week 3-4)
>
> **Focus**: Formation, Drag-and-Drop, Full Combat

* **Week 3 (01/22 - 01/28)**: **Formation System Week**
  * [ ] **Deployment**: Implement 3D Drag-and-Drop deployment (Raycast, Grid Snapping).
  * [ ] **Data Binding**: Connect formation data with battle initialization logic.
* **Week 4 (01/29 - 02/04)**: **Combat Polish Week**
  * [ ] **Presentation Sync**: Polish hit reactions, floating text, HP bar UI.
  * [ ] **Death Barrier**: Integrate Death Barrier to ensure Restart logic is leak-free and state-clean.
  * [ ] **Art Integration**: Replace whitebox assets with final resources.

### Phase 3: Flow & Tutorial (Week 5-6)
>
> **Focus**: Complete Experience, FTUE

* **Week 5 (02/05 - 02/11)**: **Roguelite Loop Week**
  * [ ] **Pick 1 of 3 UI**: Create polished Buff selection interface.
  * [ ] **Settlement**: Win/Loss settlement, data reset/inheritance logic.
* **Week 6 (02/12 - 02/18)**: **Tutorial & Polish Week**
  * [ ] **FTUE**: Create forced tutorial for the first battle (Mask, Hand Gesture).
  * [ ] **Visual Polish**: Add scene VFX (Snow drift, Fog), integrate Audio.

### Phase 4: Release & Delivery (Week 7-8)
>
> **Focus**: SDK, Compliance, Device Testing

* **Week 7 (02/19 - 02/25)**: **Platform Integration Week**
  * [ ] **TapTap SDK**: Integrate (Login/Playtime stats/Anti-addiction shell).
  * [ ] **Compliance**: Create Privacy Popup to ensure compliance.
  * [ ] **CDN Deployment**: Deploy assets to real CDN environment.
* **Week 8 (02/26 - 03/05)**: **QA & Launch Week**
  * [ ] **Device Testing**: Cover mainstream Android devices, test Notch, Performance (GC/FPS).
  * [ ] **Bug Fix**: Intensive bug fixing.
  * [ ] **Launch**: Build Release version, submit for TapTap review.

---

## ⚠️ Risk Management

1. **HybridCLR Compatibility**: If serious crashes occur on devices in Week 2 and cannot be resolved, downgrade to pure AOT immediately in Week 3 to ensure Demo runs.
2. **Art Delay**: If art assets are not ready by Week 4, use free Asset Store placeholders to avoid blocking logic.
3. **Formation Interaction**: If 3D drag feel tuning takes too long, downgrade to 2D list click deployment.
