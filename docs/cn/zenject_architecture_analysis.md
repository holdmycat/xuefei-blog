# 架构师视角：为什么要用 Zenject (依赖注入)？

**你的理解完全正确**：
Zenject 的核心魔法确实发生在 `Awake` 阶段。
1.  **Install**: `GameInstaller` 告诉容器“我是谁”（绑定关系）。
2.  **Resolve**: `SceneContext` 遍历所有对象，发现 `[Inject]` 标签，自动把对象塞进去。
3.  **Start**: 当你的 `Start()` 运行时，所有依赖都已经就位了。

---

## 核心问题：这么折腾一圈，到底图什么？

你可能会觉得：“我自己 `new` 一个对象，或者 `FindObjectOfType` 不也一样能拿到数据吗？为什么要搞这么复杂的容器？”

站在架构师的角度，我们引入 DI (依赖注入) 是为了解决以下四个核心问题：

### 1. 控制反转 (Inversion of Control) —— 谁是老大？

*   **以前 (GameClientManager)**：
    *   Manager 是老大。它负责 `new UIManager()`，它负责 `new InputRouter()`。
    *   **后果**：Manager 必须知道所有子系统的**具体实现细节**（构造函数参数、初始化顺序）。如果 `UIManager` 的构造函数变了，Manager 就得改。
*   **现在 (Zenject)**：
    *   容器 (Container) 是老大。Manager (Bootstrapper) 只是一个打工的。
    *   **收益**：Bootstrapper 只需要喊一句“给我一个 `IUIService`”，它根本不关心这个 Service 是怎么创建出来的，也不关心它是一个真 UI 还是一个测试用的假 UI。
    *   **架构词汇**：**关注点分离 (Separation of Concerns)**。创建逻辑与业务逻辑彻底分家。

### 2. 依赖图的自动解析 (Auto-Wiring) —— 解决“套娃”难题

想象一下未来的需求：
*   `SkillSystem` 依赖 `AudioManager` (放技能音效)。
*   `AudioManager` 依赖 `ConfigLoader` (读取音量配置)。
*   `ConfigLoader` 依赖 `NetworkService` (从服务器拉配置)。

**如果没有 Zenject**：
你在 `GameClientManager` 里得这么写：
```csharp
var net = new NetworkService();
var config = new ConfigLoader(net); // 手动传参
var audio = new AudioManager(config); // 手动传参
var skill = new SkillSystem(audio); // 手动传参... 疯了！
```
一旦中间某个环节变了（比如 Audio 不再依赖 Config 了），你得去改这串初始化代码。

**有了 Zenject**：
你只需要在 Installer 里写：
```csharp
Container.Bind<NetworkService>().AsSingle();
Container.Bind<ConfigLoader>().AsSingle();
Container.Bind<AudioManager>().AsSingle();
Container.Bind<SkillSystem>().AsSingle();
```
Zenject 会自动分析出：要创建 Skill 必须先创建 Audio，要创建 Audio 必须先创建 Config... **它自动帮你把这棵复杂的依赖树理顺了。**

### 3. 生命周期管理 (Lifetime Management)

*   **Singleton (单例)**：`AsSingle()`。整个游戏只有一份。
*   **Transient (瞬态)**：`AsTransient()`。每次注入都 `new` 一个新的。
*   **Scene Scope (场景级)**：`SceneContext`。切场景自动销毁。

**以前**：你得自己写 `public static Instance`，还得在 `OnDestroy` 里手动置空，防止内存泄漏。
**现在**：你只需要改一行配置代码 (`AsSingle` vs `AsTransient`)，容器自动帮你管理对象的生老病死。

### 4. 可测试性 (Testability) —— 架构师的底线

这是区分“脚本小子”和“工程师”的分水岭。

假设你要测试“角色受到攻击扣血”的逻辑。
*   **硬编码**：你的代码里写死了 `Audio.Play("Hurt")`。如果不启动 Unity 音频引擎，测试就会报错。
*   **注入**：你的代码依赖 `IAudioService`。
    *   在游戏里：注入 `RealAudioService`。
    *   在测试里：注入 `MockAudioService` (一个空壳，什么都不做，或者只记录“我被调用了”)。

**结论**：DI 让你的代码可以在**没有 Unity 引擎**的环境下运行单元测试。

---

## 总结

你现在的感觉是“杀鸡用牛刀”，因为 Demo 的依赖关系还很简单（只有 Input 和 UI）。
但随着项目膨胀，依赖关系会从“一条线”变成“一张网”。
Zenject 就是帮你**织这张网的机器**，而不是让你手织。

**一句话概括**：
我们放弃了“直接控制权”（自己 new），换取了**架构的灵活性**和**系统的可维护性**。
