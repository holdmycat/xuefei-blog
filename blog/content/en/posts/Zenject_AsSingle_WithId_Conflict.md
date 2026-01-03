---
title: "Resolving Zenject 6 AsSingle Conflict with WithId"
date: 2026-01-03T09:59:00+08:00
draft: false
tags: ["Architecture", "Zenject", "Unity"]
---

## Problem Context

When implementing a "Dual World" architecture, we need to maintain independent time systems (`Clock`) for both the server and the client. A natural approach is to use Zenject's `WithId` feature to distinguish between them and bind each as a Singleton.

The code might look like this:

```csharp
Container.Bind<Clock>().WithId(ClockIds.Server).AsSingle().IfNotBound();
Container.Bind<Clock>().WithId(ClockIds.Client).AsSingle().IfNotBound();
```

However, in Zenject 6, this code throws an exception indicating a duplicate `AsSingle` binding.

## Why it Violated Principles

This is a limitation introduced by a breaking change in Zenject 6.

Zenject internally maintains a `SingletonMarkRegistry`. Once a specific Type is marked as `AsSingle`, it is registered in this registry, regardless of its Binding ID.

When we attempt to call `AsSingle` on the same type again (even with a different ID, such as `ClockIds.Client`), Zenject checks the `SingletonMarkRegistry`, finds that the type has already been marked as a singleton, triggers a conflict check, and throws an exception.

This means that in Zenject 6, `AsSingle` behaves more like a "Global Singleton for Type" rather than just a "Singleton within the current Binding ID".

## Solution

To achieve "Singleton per ID" (meaning it is a singleton for that specific ID, but different IDs for the same type can coexist), we should use `AsCached()`.

```csharp
Container.Bind<Clock>().WithId(ClockIds.Server).AsCached().IfNotBound();
Container.Bind<Clock>().WithId(ClockIds.Client).AsCached().IfNotBound();
```

### Why Does This Work?

`AsCached()` simply instructs the Zenject container to cache the instance when resolving that binding. When combined with `IfNotBound()` or when bound only once within the same Context, it effectively behaves as a singleton for that specific ID.

Most importantly, `AsCached()` does not interact with the global `SingletonMarkRegistry`, thereby bypassing the Zenject 6 limitation on multiple `AsSingle` calls for the same type.

This allows us to safely create independent global Clock instances for both the Server and the Client.
