+++
title = "AOT-Safe C# in Unity: IL2CPP Without Runtime Reflection"
date = 2025-12-14T10:00:00Z
summary = "A production-oriented guide to AOT vs JIT, why late-bound generics fail on IL2CPP, and how to replace runtime reflection with deterministic registries generated at compile time (including how to build and integrate the generator DLL)."
categories = ["Game Systems", "Engineering"]
tags = ["Unity", "CSharp", "AOT", "JIT", "IL2CPP", "Generics", "SourceGenerator", "Performance"]
lang = "en"
slug = "aot-safe-unity-il2cpp-without-reflection"
+++

Shipping on IL2CPP forces you to treat “works in Editor” as a prototype signal, not a correctness guarantee. The core difference is simple: **AOT requires code paths to be knowable at build time**, while many dynamic patterns assume the runtime can discover or construct them later.

This article intentionally avoids runtime-reflection code samples. Everything below targets deterministic, AOT-friendly runtime behavior.

## AOT vs JIT in one mental model

### AOT (Ahead-of-Time)
IL2CPP compiles your managed code into native code ahead of runtime. That means:
- Code that is not *statically reachable* can disappear after stripping.
- Runtime behaviors that depend on metadata discovery are fragile.
- “Rare branch” code can crash only when triggered on device.

### JIT (Just-in-Time)
In JIT-like environments, code can be resolved more flexibly at runtime. Many dynamic patterns appear safe—until you move to AOT.

**Portability rule:** if you must ship IL2CPP, design the runtime as if JIT is not available.

## The real problem with `MakeGenericMethod` on IL2CPP

`MakeGenericMethod` is usually a symptom of **late-bound generic instantiation**. If the generic type argument is determined from runtime data (configs, network payloads, content packs), IL2CPP may not have produced the required closed generic specialization during AOT compilation.

**Production guideline:**
- Avoid runtime construction of generic calls.
- Replace late-bound generics with **static dispatch** or **generated dispatch**.

## Ban list for shipping runtimes

These patterns are not “evil,” but they are high-risk in shipping IL2CPP builds and should be treated as exceptions requiring justification and tests:

- Broad runtime type discovery (e.g., scanning all implementations at startup)
- Late-bound generic invocation (runtime decides generic type arguments)
- Metadata-driven auto-registration without deterministic, build-time artifacts

If you need dynamic discovery for authoring convenience, keep it **Editor-only** and export deterministic outputs into runtime assets or generated code.

## Platform strategy: keep authoring dynamic, keep runtime deterministic

### Editor
- Allow convenience: automation, validation, tooling.
- Convert results into stable runtime structures (generated code, baked assets).

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
using System;
using System.Collections.Generic;

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
Instead of constructing generic calls at runtime, map known types to known handlers.

```csharp
using System;
using System.Collections.Generic;

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
Source Generators keep authoring ergonomic while runtime stays deterministic:
- developers add an attribute
- build emits a registry method referencing types directly
- runtime calls one generated initializer

This is the most robust approach when registries are large or evolving quickly.

---

## C# Source Generators: end-to-end (Unity-ready, including generator DLL)

A Source Generator **is compiled into a DLL** and loaded by the C# compiler as an **Analyzer**. In Unity, the generator runs during script compilation (Editor side) and outputs `*.g.cs` that becomes part of your runtime assembly. The generator DLL itself should remain **Editor-only** and should not ship in the player build.

### 1) Runtime code: define a marker attribute
This lives in your Unity runtime scripts (e.g., Assembly-CSharp or a runtime asmdef).

```csharp
using System;

[AttributeUsage(AttributeTargets.Class, Inherited = false)]
public sealed class RegisterForRegistryAttribute : Attribute
{
    public RegisterForRegistryAttribute(string id) => Id = id;
    public string Id { get; }
}
```

### 2) Runtime code: annotate types
```csharp
[RegisterForRegistry("skill.fireball")]
public sealed class FireballSkill
{
    public void Initialize() { }
}
```

### 3) Generator output: deterministic registry code
Your generator should emit one stable entry point (example):

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

### 4) Create a separate generator project (`.csproj`)
Keep the generator outside the Unity script assemblies, as a normal .NET project.

Recommended layout:
```
repo/
  src/
    Game.Runtime/        (optional: shared runtime types for non-Unity tests)
    Game.Generator/      (the generator project)
  UnityProject/
```

#### Minimal `Game.Generator.csproj`
```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>netstandard2.0</TargetFramework>
    <LangVersion>latest</LangVersion>
    <Nullable>enable</Nullable>

    <!-- Important: make the build output an Analyzer -->
    <OutputItemType>Analyzer</OutputItemType>
    <IncludeBuildOutput>true</IncludeBuildOutput>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Microsoft.CodeAnalysis.CSharp" Version="4.8.0" PrivateAssets="all" />
    <PackageReference Include="Microsoft.CodeAnalysis.Analyzers" Version="3.3.4" PrivateAssets="all" />
  </ItemGroup>
</Project>
```

> Versions can differ. The key is: Roslyn packages + `OutputItemType=Analyzer` + `PrivateAssets=all`.

### 5) Build the generator DLL
From the generator project folder:

**macOS/Linux**
```bash
dotnet restore
dotnet build -c Release
```

**Windows (PowerShell)**
```powershell
dotnet restore
dotnet build -c Release
```

Typical output path:
```
Game.Generator/bin/Release/netstandard2.0/Game.Generator.dll
```

### 6) Copy the DLL into Unity and mark it as an Analyzer (Editor-only)
Recommended Unity path:
```
UnityProject/Assets/Plugins/RoslynAnalyzers/Game.Generator.dll
```

Then in Unity Inspector for that DLL:
- enable **Editor** only
- mark as **Roslyn Analyzer** (Unity may expose this as an inspector toggle or via an Asset Label such as `RoslynAnalyzer`, depending on Unity version)

After that, trigger a script recompile. The generator will run and generated sources will compile into your assemblies.

### 7) Automate DLL sync (avoid “it works on my machine”)
**macOS/Linux**
```bash
dotnet build -c Release src/Game.Generator/Game.Generator.csproj

cp src/Game.Generator/bin/Release/netstandard2.0/Game.Generator.dll \
   UnityProject/Assets/Plugins/RoslynAnalyzers/
```

**Windows (PowerShell)**
```powershell
dotnet build -c Release .\src\Game.Generator\Game.Generator.csproj

Copy-Item .\src\Game.Generator\bin\Release\netstandard2.0\Game.Generator.dll `
  .\UnityProject\Assets\Plugins\RoslynAnalyzers\ -Force
```

### 8) Implementation quality checklist for a production generator
- Prefer `IIncrementalGenerator` for performance and stability.
- Avoid all disk I/O.
- Emit stable namespaces and filenames.
- Emit actionable diagnostics:
  - duplicate IDs
  - non-public types
  - missing required interface/base type (if you enforce one)

### 9) CI checklist (the part teams forget)
- build generator DLL in CI
- copy into Unity project
- run Unity batchmode compilation
- run an IL2CPP build smoke test (so AOT failures are caught early)

## Production checklist before shipping

- IL2CPP build in CI (not “right before release”)
- Startup budget measured (no hidden scanning costs)
- Registry correctness validated (IDs unique, types valid)
- Hot paths profiled on target hardware
- Cross-platform sanity verified

## Recommended team rules

1. Runtime must be deterministic: no runtime scanning, no late-bound generics.
2. Authoring convenience is allowed in Editor, but must bake into assets or generated code.
3. Exceptions require:
   - documented rationale
   - platform test plan
   - IL2CPP smoke test coverage
