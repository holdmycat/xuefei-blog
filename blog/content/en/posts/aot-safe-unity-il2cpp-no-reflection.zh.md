+++
title = "Unity 的 AOT 安全 C#：在 IL2CPP 下做到零运行时反射"
date = 2024-02-10T10:00:00Z
summary = "面向生产环境的 AOT vs JIT 心智模型；解释为何 IL2CPP 下的“晚绑定泛型”容易失败；并给出用 Source Generator 生成确定性注册表、彻底替代运行时反射的落地方案。"
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
当泛型类型参数来自运行时数据（配置、网络协议、可扩展内容等）时，IL2CPP 可能并没有在 AOT 阶段生成对应的 closed generic specialization。

**生产级建议：**
- 避免在运行时构造泛型调用。
- 用**静态派发**或**生成派发**替代“运行时生成泛型”。

## 上线运行时的“禁用清单”

这些模式不是“绝对不能用”，但在 IL2CPP 的上线运行时中风险极高，应视为需要强论证与强测试的例外：

- 运行时做大范围类型发现（例如扫描整个程序集来找实现类）
- 晚绑定泛型调用（运行时决定泛型参数）
- 依赖元数据的自动注册，但没有确定性、构建期产物兜底

如果你需要动态发现来提升策划/开发体验，请把它限制在**Editor**，并把结果导出为运行时可用的确定性资产或生成代码。

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

**收益：**无晚绑定泛型、行为可预期、性能更稳定  
**残留问题：**映射表规模大时的维护成本

### 模式 3：构建期代码生成（大规模推荐）
Source Generator 能兼顾“写起来方便”和“运行时确定”：
- 开发者只需标注 Attribute
- 构建期生成引用类型的注册代码
- 运行时只调用一个生成入口

## C# Source Generator：完整落地流程（Unity 版）

### 1）Runtime 工程：定义标记 Attribute
```csharp
using System;

[AttributeUsage(AttributeTargets.Class, Inherited = false)]
public sealed class RegisterForRegistryAttribute : Attribute
{
    public RegisterForRegistryAttribute(string id) => Id = id;
    public string Id { get; }
}
```

### 2）Runtime 工程：给类型打标
```csharp
[RegisterForRegistry("skill.fireball")]
public sealed class FireballSkill
{
    public void Initialize() { }
}
```

### 3）Generator 工程：生成确定性注册代码
生成器应当：
- 收集所有被标记的类型
- 做约束校验（ID 重复、非 public、缺少约定等）
- 产出单文件，例如 `GeneratedRegistry.g.cs`

示例生成代码（运行时可用）：

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

### 4）优先使用 Incremental Generator
推荐使用 `IIncrementalGenerator`，更快、更稳定。

生成器实现清单：
- 禁止磁盘 I/O
- 不依赖 UnityEditor
- 命名空间/文件名稳定
- 诊断信息可行动（能定位到源码行）

### 5）Unity 集成清单（实操）
- 生成器独立 `.csproj` 构建（常见 `netstandard2.0`）
- 将生成器 DLL 以 Roslyn Analyzer 的形式导入 Unity（Editor-only）
- 确认脚本编译后能出现 `.g.cs` 输出效果
- CI 增加 IL2CPP 构建与 smoke test，确保持续可用

## 上线前检查清单

- **CI 里固定跑 IL2CPP 构建**（不是“发布前一周才跑”）
- **启动预算**已测量（没有隐藏扫描成本）
- **注册表正确性**已校验（ID 唯一、类型合法、必要时顺序确定）
- **热点路径**在目标机型上完成 Profile（避免分配与间接调用过深）
- **跨平台一致性**验证通过（同一份内容产出同一份注册结果）

## 团队级规则建议

1. 上线运行时必须确定：不做运行时扫描，不做晚绑定泛型。
2. 编辑器允许便利，但必须烘焙为运行时资产或生成代码。
3. 任何例外必须配套：
   - 明确原因与影响面
   - 平台测试计划
   - 覆盖该路径的 IL2CPP smoke test
