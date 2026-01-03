---
title: "Zenject 6 AsSingle 与 WithId 的冲突与解决"
date: 2026-01-03T09:59:00+08:00
draft: false
tags: ["Architecture", "Zenject", "Unity"]
---

## 问题背景 (Problem)

在实现“双世界”（Dual World）架构时，我们需要为服务器和客户端分别维护独立的时间系统 (`Clock`)。很自然的想法是使用 Zenject 的 `WithId` 功能来区分它们，并分别绑定为单例。

代码如下：

```csharp
Container.Bind<Clock>().WithId(ClockIds.Server).AsSingle().IfNotBound();
Container.Bind<Clock>().WithId(ClockIds.Client).AsSingle().IfNotBound();
```

然而，在 Zenject 6 中，这段代码会抛出异常，提示重复的 `AsSingle` 绑定。

## 为什么违背设计原则 (Why it violated principles)

这是 Zenject 6 的一个 Breaking Change 带来的限制。

Zenject 内部维护了一个 `SingletonMarkRegistry`。一旦某个类型（Type）被标记为 `AsSingle`，无论其 Binding ID 是否不同，都会在这个注册表中登记。

当我们尝试对同一个类型再次调用 `AsSingle`（即使使用了不同的 ID，如 `ClockIds.Client`），Zenject 会检查 `SingletonMarkRegistry`，发现该类型已经被标记为单例，从而触发冲突检查并抛出异常。

这意味着在 Zenject 6 中，`AsSingle` 实际上更接近于“全局类型单例”，而不仅仅是“当前 Binding ID 下的单例”。

## 解决方案 (Solution)

为了实现“按 ID 区分的单例”（即在该 ID 下是单例，但同类型的不同 ID 可以共存），我们应该使用 `AsCached()`。

```csharp
Container.Bind<Clock>().WithId(ClockIds.Server).AsCached().IfNotBound();
Container.Bind<Clock>().WithId(ClockIds.Client).AsCached().IfNotBound();
```

### 为什么这样做有效？

`AsCached()` 只是告诉 Zenject 容器在解析该 Binding 时缓存其实例。如果结合 `IfNotBound()` 或在同一个 Context 中只绑定一次，它的行为就等同于该 ID 下的单例。

最重要的是，`AsCached()` 不会去触碰全局的 `SingletonMarkRegistry`，从而避开了 Zenject 6 对同类型多次 `AsSingle` 的限制。

这样我们就可以安全地为 Server 和 Client 分别创建独立的全局 Clock 实例了。
