+++
title = "Shipping a Combat Skill System Without Regrets"
date = 2024-02-10T10:00:00Z
summary = "Notes from building a deterministic, designer-friendly skill system that still runs inside tight frame budgets."
categories = ["Game Systems"]
tags = ["SkillSystem", "Unity", "Performance", "AOT", "IL2CPP"]
lang = "en"
slug = "shipping-combat-skill-system"
+++

Designing combat systems under IL2CPP means juggling determinism, readability, and tool support.

## Architecture sketch
- **Data-first**: drive skills from `ScriptableObject` assets with immutable payloads.
- **Deterministic core**: keep the runtime graph free of `DateTime`, floats that drift, and thread-unsafe caches.
- **Authoring safety**: add editor validators that fail builds when designers leave stray reflection calls.

## Useful patterns
1. **Action atoms** — tiny, composable commands (spawn VFX, apply force, queue follow-ups) stitched by data.
2. **State mirroring** — mirror combat state into a pure struct world for rollback or replays.
3. **AOT hygiene** — prewarm generic instantiations and avoid late-bound reflection in skill effects.

## Checklist before shipping
- Burst-compiled hot paths profiled on target hardware.
- Determinism checks passing across platforms.
- Skill authoring validators green in CI.
- Network payload sizes recorded and budgeted.

This site will collect more focused notes on Unity tooling, pipelines, and AI-assisted workflows soon.
