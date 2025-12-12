+++
title = "无遗憾地交付战斗技能系统"
date = 2024-02-10T10:00:00Z
summary = "在 IL2CPP 下做确定性、设计师友好且性能可控的技能系统的一些笔记。"
categories = ["Game Systems"]
tags = ["SkillSystem", "Unity", "Performance", "AOT", "IL2CPP"]
lang = "zh"
slug = "combat-skill-system-zh"
+++

在 IL2CPP 下设计战斗系统，需要同时兼顾确定性、可读性和工具链支持。

## 架构草图
- **数据优先**：用 `ScriptableObject` 携带不可变的技能数据。
- **确定性核心**：运行时图保持无 `DateTime`、避免漂移的浮点和线程不安全缓存。
- **创作安全**：编辑器校验，构建时阻断残留的反射调用。

## 实用模式
1. **Action atoms** — 极小的可组合命令（生成 VFX、施加力、排队后续动作），由数据串联。
2. **状态镜像** — 将战斗状态镜像成纯 struct 世界，方便回滚或回放。
3. **AOT 卫生** — 预热泛型实例化，技能效果避开后期绑定反射。

## 出货前清单
- Burst 编译的热点在目标硬件上过 Profiling。
- 跨平台确定性检查通过。
- 技能创作期的校验在 CI 里全绿。
- 网络负载大小有记录并纳入预算。

后续会写更多关于 Unity 工具链、流水线和 AI 辅助流程的短笔记。
