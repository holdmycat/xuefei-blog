+++
title = "Unity 的 AOT 安全 C#：在 IL2CPP 下做到零运行时反射"
date = 2025-12-14T10:00:00Z
summary = "面向生产环境的 AOT vs JIT 心智模型；解释为何 IL2CPP 下的“晚绑定泛型”容易失败；并给出用 Source Generator 生成确定性注册表、彻底替代运行时反射的落地方案（包含 Generator DLL 的构建与 Unity 集成步骤）。"
categories = ["游戏系统", "工程实践"]
tags = ["Unity", "CSharp", "AOT", "JIT", "IL2CPP", "Generics", "SourceGenerator", "Performance"]
lang = "zh"
slug = "aot-safe-unity-il2cpp-without-reflection-zh"
+++

在 IL2CPP 上线意味着你必须把“Editor 里能跑”当作原型信号，而不是正确性保证。核心差异很简单：**AOT 需要在构建期就能确定代码路径**，而很多动态模式默认运行时可以再去发现或构造这些路径。

本文刻意不提供任何“运行时反射”的代码示例。下文所有推荐方案都以**确定性、AOT 友好**的运行时行为为目标。

## AOT vs JIT：一个足够用的心智模型

### AOT（Ahead-of-Time）
IL2CPP 会在运行前把托管代码编译为原生代码。这意味着：
- 构建链路（裁剪/剥离）后，**非静态可达**的代码可能不存在于最终包体中。
- 依赖运行时元数据发现的行为更脆弱。
- “低概率分支”只在真机触发时才爆炸。

### JIT（Just-in-Time）
在类 JIT 环境里，运行时对代码的解析/生成更灵活。很多动态模式看起来没问题——直到迁移到 AOT。

**可移植性原则：**只要要发 IL2CPP，就按“没有 JIT”来设计运行时。

## IL2CPP 下 `MakeGenericMethod` 的本质问题

`MakeGenericMethod` 往往指向同一个根因：**晚绑定的泛型实例化**。  
当泛型类型参数来自运行时数据（配置、网络协议、内容包等）时，IL2CPP 可能并没有在 AOT 阶段生成对应的 closed generic specialization。

**生产级建议：**
- 避免在运行时构造泛型调用。
- 用**静态派发**或**生成派发**替代“运行时生成泛型”。

## 上线运行时的“禁用清单”

这些模式不是“绝对不能用”，但在 IL2CPP 的上线运行时中风险极高，应视为需要强论证与强测试的例外：

- 运行时做大范围类型发现（例如扫描整个程序集来找实现类）
- 晚绑定泛型调用（运行时决定泛型参数）
- 依赖元数据的自动注册，但没有确定性、构建期产物兜底

如果你需要动态发现来提升策划/开发体验，请把它限制在 **Editor**，并把结果导出为运行时可用的确定性资产或生成代码。

## 平台策略：编辑器可以动态，运行时必须确定

### Editor
- 允许便利：自动化、校验、工具链增强。
- 把结果转换为稳定的运行时结构（生成代码、烘焙资产）。

### Runtime（shipping）
- 不扫描。
- 不晚绑定泛型。
- 初始化顺序可控、可复现。
- 只依赖显式数据与显式代码引用。

### 常用 gating 手段
- `UNITY_EDITOR`：仅工具链启用
- `ENABLE_IL2CPP`：必要时做平台分流（尽量少用）

## 零反射运行时的可扩展模式

### 模式 1：显式注册表（小到中等规模）
静态注册是 IL2CPP 下最可靠的方案。

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

**适用场景：**类型数量有限、内容变化不频繁、需要快速稳定上线  
**代价：**人工维护成本

### 模式 2：静态派发（替代晚绑定泛型）
不要在运行时“构造泛型调用”，而是把已知类型映射到强类型 Handler。

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

**收益：**无晚绑定泛型、行为可预期、性能稳定  
**残留问题：**映射表规模大时的维护成本

### 模式 3：构建期代码生成（大规模推荐）
Source Generator 能兼顾“写起来方便”和“运行时确定”：
- 开发者只需标注 Attribute
- 构建期生成引用类型的注册代码
- 运行时只调用一个生成入口

---

## C# Source Generator：完整落地流程（Unity 版，补齐 DLL 生成与集成）

一个 Source Generator **必须先被编译成 DLL（Analyzer DLL）**，再由 C# 编译器以 **Analyzer** 形式加载。  
在 Unity 中：生成器在 **Editor 侧脚本编译阶段**运行，输出 `*.g.cs` 并参与编译；生成器 DLL 本身应当 **仅 Editor 使用**，不应该进入 Player 包体。

### 1）Runtime 代码：定义标记 Attribute
放在 Unity 的运行时代码（Assembly-CSharp 或 runtime asmdef）中。

```csharp
using System;

[AttributeUsage(AttributeTargets.Class, Inherited = false)]
public sealed class RegisterForRegistryAttribute : Attribute
{
    public RegisterForRegistryAttribute(string id) => Id = id;
    public string Id { get; }
}
```

### 2）Runtime 代码：给类型打标
```csharp
[RegisterForRegistry("skill.fireball")]
public sealed class FireballSkill
{
    public void Initialize() { }
}
```

### 3）生成器输出：确定性注册表代码
生成器应当生成一个稳定入口（示例）：

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

运行时使用：

```csharp
var registry = new Registry();
GeneratedRegistry.RegisterAll(registry);
```

### 4）创建独立的生成器工程（`.csproj`）
不要把生成器代码写进 Unity 脚本程序集，建议用标准 .NET 工程独立构建。

推荐目录：
```
repo/
  src/
    Game.Generator/      (生成器工程)
  UnityProject/
```

#### 最小 `Game.Generator.csproj`
```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>netstandard2.0</TargetFramework>
    <LangVersion>latest</LangVersion>
    <Nullable>enable</Nullable>

    <!-- 关键：让输出成为 Analyzer -->
    <OutputItemType>Analyzer</OutputItemType>
    <IncludeBuildOutput>true</IncludeBuildOutput>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Microsoft.CodeAnalysis.CSharp" Version="4.8.0" PrivateAssets="all" />
    <PackageReference Include="Microsoft.CodeAnalysis.Analyzers" Version="3.3.4" PrivateAssets="all" />
  </ItemGroup>
</Project>
```

> 版本可调整。关键点是：Roslyn 包 + `OutputItemType=Analyzer` + `PrivateAssets=all`。

### 5）构建生成器 DLL
在生成器工程目录执行：

**macOS/Linux**
```bash
dotnet restore
dotnet build -c Release
```

**Windows（PowerShell）**
```powershell
dotnet restore
dotnet build -c Release
```

常见输出路径：
```
Game.Generator/bin/Release/netstandard2.0/Game.Generator.dll
```

### 6）拷贝 DLL 到 Unity，并标记为 Analyzer（Editor-only）
建议放置路径：
```
UnityProject/Assets/Plugins/RoslynAnalyzers/Game.Generator.dll
```

然后在 Unity Inspector 中对该 DLL 设置：
- **仅 Editor**（Editor only）
- 标记为 **Roslyn Analyzer**（不同 Unity 版本 UI 不同：可能是勾选项，也可能通过 Asset Label `RoslynAnalyzer`）

之后触发脚本重编译，生成器将运行并参与编译。

### 7）自动同步 DLL（避免手动复制遗漏）
**macOS/Linux**
```bash
dotnet build -c Release src/Game.Generator/Game.Generator.csproj

cp src/Game.Generator/bin/Release/netstandard2.0/Game.Generator.dll \
   UnityProject/Assets/Plugins/RoslynAnalyzers/
```

**Windows（PowerShell）**
```powershell
dotnet build -c Release .\src\Game.Generator\Game.Generator.csproj

Copy-Item .\src\Game.Generator\bin\Release\netstandard2.0\Game.Generator.dll `
  .\UnityProject\Assets\Plugins\RoslynAnalyzers\ -Force
```

### 8）生产级生成器质量清单
- 推荐 `IIncrementalGenerator`（更快更稳定）
- 禁止任何磁盘 I/O
- 输出命名稳定（namespace、文件名）
- 输出可行动的诊断：
  - ID 重复
  - 非 public 类型
  - 缺少约定接口/基类（如果你强制）

### 9）CI 清单（最容易缺失的环节）
- CI 构建 generator DLL
- 同步到 Unity 工程
- Unity batchmode 编译
- 跑一次 IL2CPP build smoke test（让 AOT 失败尽早暴露）

## 上线前检查清单

- CI 里固定跑 IL2CPP 构建（不是“发布前一周才跑”）
- 启动预算已测量（无隐藏扫描成本）
- 注册表正确性已校验（ID 唯一、类型合法）
- 热点路径在目标机型上完成 Profile
- 跨平台一致性验证通过

## 团队级规则建议

1. 上线运行时必须确定：不做运行时扫描，不做晚绑定泛型。
2. 编辑器允许便利，但必须烘焙为运行时资产或生成代码。
3. 任何例外必须配套：
   - 明确原因与影响面
   - 平台测试计划
   - 覆盖该路径的 IL2CPP smoke test
