+++
title = "AOT-Safe C# in Unity: IL2CPP Without Runtime Reflection"
date = 2024-02-10T10:00:00Z
summary = "A production-oriented guide to AOT vs JIT, why late-bound generics fail on IL2CPP, and how to replace runtime reflection with deterministic registries generated at compile time."
categories = ["Game Systems", "Engineering"]
tags = ["Unity", "CSharp", "AOT", "JIT", "IL2CPP", "Generics", "SourceGenerator", "Performance"]
lang = "en"
slug = "aot-safe-unity-il2cpp-without-reflection"
+++

Shipping on IL2CPP forces you to treat “works in Editor” as a prototype signal, not a correctness guarantee. The core difference is simple: **AOT requires code paths to be knowable at build time**, while many dynamic patterns assume the runtime can discover or construct them later.

This article avoids runtime-reflection code samples by design. Everything below is built around deterministic, AOT-friendly runtime behavior.

## AOT vs JIT in one mental model

### AOT (Ahead-of-Time)
IL2CPP compiles your managed code into native code ahead of runtime. That means:
- Code that is not *statically reachable* can be missing after the build pipeline does stripping.
- Runtime behaviors that depend on metadata discovery are fragile.
- “Rare branch” code can crash only when triggered on device.

### JIT (Just-in-Time)
In JIT-like environments, code can be compiled or resolved at runtime more flexibly. Many dynamic patterns appear safe—until you move to AOT.

**Portability rule:** if you must ship IL2CPP, design the runtime as if JIT is not available.

## The real problem with `MakeGenericMethod` on IL2CPP

`MakeGenericMethod` is a symptom of a deeper issue: **late-bound generic instantiation**.  
If the generic type argument is determined from runtime data (configs, network payloads, user mods, etc.), IL2CPP may not have produced the required closed generic specialization during AOT compilation.

**Production guideline:**
- Avoid runtime construction of generic calls.
- Replace “generic created at runtime” with **static dispatch** or **generated dispatch**.

## Ban list for shipping runtimes

These patterns are not “evil,” but they are high-risk in shipping IL2CPP builds and should be treated as exceptions requiring justification and tests:

- Broad type discovery at runtime (e.g., scanning entire assemblies for implementations)
- Late-bound generic invocation (runtime-determined generic type arguments)
- Metadata-driven auto-registration that is not backed by deterministic, build-time artifacts

If you need dynamic discovery for authoring convenience, keep it **Editor-only** and export deterministic outputs into runtime assets.

## Platform strategy: keep authoring dynamic, keep runtime deterministic

### Editor
- Allow convenience: dynamic discovery, automation, validation, tooling.
- Convert the result into stable runtime structures (generated code, baked assets).

### Runtime (shipping)
- No scanning.
- No late-bound generics.
- Deterministic initialization order.
- Explicit data and explicit code references.

### Practical build gating
- `UNITY_EDITOR` for tooling-only behaviors
- `ENABLE_IL2CPP` for platform-specific fallbacks (only when unavoidable)

## Reflection-free runtime patterns that scale

### Pattern 1: Explicit registry (small to medium scale)
A static registry is the simplest IL2CPP-safe mechanism.

```csharp
public sealed class Registry
{
    private readonly Dictionary<string, Type> _map = new();

    public void Register(string id, Type type) => _map[id] = type;
    public Type Resolve(string id) => _map[id];
}

public static class RuntimeRegistry
{
    public static void RegisterAll(Registry r)
    {
        r.Register("skill.fireball", typeof(FireballSkill));
        r.Register("skill.icebolt", typeof(IceBoltSkill));
    }
}
```

**When to use:** stable projects, limited number of types, tight deadlines  
**Tradeoff:** manual upkeep

### Pattern 2: Static dispatch (replace late-bound generics)
Instead of “construct a generic call at runtime,” map known types to known handlers.

```csharp
public interface IHandler
{
    void Apply(object target);
}

public sealed class Handler<T> : IHandler
{
    private readonly Action<T> _apply;
    public Handler(Action<T> apply) => _apply = apply;

    public void Apply(object target) => _apply((T)target);
}

public static class HandlerMap
{
    public static readonly Dictionary<Type, IHandler> Map = new()
    {
        { typeof(FireballSkill), new Handler<FireballSkill>(t => t.Initialize()) },
        { typeof(IceBoltSkill), new Handler<IceBoltSkill>(t => t.Initialize()) },
    };
}
```

**Benefit:** no late-bound generics, predictable behavior, good performance  
**Remaining problem:** keeping the map updated at scale

### Pattern 3: Compile-time code generation (recommended at scale)
Source Generators let you keep authoring convenience while making runtime deterministic:
- designers/devs add an attribute
- build emits a registry method that references types directly
- runtime calls a single generated initializer

This is the most robust path when the registry is large or evolving quickly.

## C# Source Generators: end-to-end (Unity-ready)

### 1) Runtime project: define a marker attribute
```csharp
using System;

[AttributeUsage(AttributeTargets.Class, Inherited = false)]
public sealed class RegisterForRegistryAttribute : Attribute
{
    public RegisterForRegistryAttribute(string id) => Id = id;
    public string Id { get; }
}
```

### 2) Runtime project: annotate types
```csharp
[RegisterForRegistry("skill.fireball")]
public sealed class FireballSkill
{
    public void Initialize() { }
}
```

### 3) Generator project: emit deterministic registration code
A generator should:
- collect all annotated types
- validate invariants (duplicate IDs, non-public types, missing requirements)
- emit a single file like `GeneratedRegistry.g.cs`

Example emitted runtime code:

```csharp
public static class GeneratedRegistry
{
    public static void RegisterAll(Registry r)
    {
        r.Register("skill.fireball", typeof(FireballSkill));
        r.Register("skill.icebolt", typeof(IceBoltSkill));
    }
}
```

Runtime usage:

```csharp
var registry = new Registry();
GeneratedRegistry.RegisterAll(registry);
```

### 4) Use an incremental generator
Prefer `IIncrementalGenerator` for performance and stability.

Generator checklist:
- no disk I/O
- no dependency on UnityEditor APIs
- stable namespaces and filenames
- produce actionable diagnostics

### 5) Unity integration checklist (practical)
- Build the generator as a separate `.csproj` (commonly `netstandard2.0`)
- Import the generator DLL into Unity as a Roslyn Analyzer (Editor-only)
- Verify generated files appear after script compilation
- Add a CI step that ensures IL2CPP builds still compile and run smoke tests

## Production checklist before shipping

- **IL2CPP build in CI** (not “right before release”)
- **Startup budget** measured (no hidden scanning costs)
- **Registry correctness** validated (IDs unique, types valid, deterministic order where needed)
- **Hot paths** profiled on target hardware (avoid allocations and indirect dispatch where possible)
- **Cross-platform sanity** (same content produces same registry output)

## Recommended team rules

1. Runtime must be deterministic: no runtime scanning, no late-bound generics.
2. Authoring convenience is allowed in Editor, but must bake outputs into generated code or assets.
3. Any exception requires:
   - a documented reason
   - a platform test plan
   - an IL2CPP smoke test that exercises the exceptional path
