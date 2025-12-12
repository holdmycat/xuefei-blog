+++
title = "项目"
description = "最近关注的项目与工具。"
+++

- **Ebonor（Steam）** — 沉浸式动作冒险，负责战斗手感、养成与构建/热补丁流水线；上线 IL2CPP 版本，技能运行时确定性，配套编辑器工具支持策划调试。
- **FrameScope** — 面向主机平台的轻量级帧预算 HUD，展示 CPU/GPU 拆分与系统预算。
- **AOT Guardrails** — 构建期分析器，标记反射重路径并给出 IL2CPP 友好的替代方案。
- **Pipeline Stitcher** — 用于 Unity 多平台构建的 CI 模板，带缓存复用的工件管线。

## 游戏项目

**Ebonor（Steam）** — 3D 动作 Roguelite 原型，展示数据驱动战斗与模块化技能。

- 上线公开 Steam 页面并完成素材包装。
- 小团队工作流下自 0 到 1 完成核心玩法与工具链。
- 关注迭代速度、可维护性与性能。

{{ with .Site.Params.links.steam }}[Steam 页面 ↗]({{ . }}){: target="_blank" rel="noopener noreferrer"}{{ end }}
{{ with .Site.Params.links.gameRepo }}{{ if ne . "" }} · [Gameplay/Tools Repo ↗]({{ . }}){: target="_blank" rel="noopener noreferrer"}{{ end }}{{ end }}
