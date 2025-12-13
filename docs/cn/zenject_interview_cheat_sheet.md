# Zenject (Extenject) 面试突击小抄 (Cheat Sheet)

**目标**：在 30 分钟内掌握 Zenject 的核心概念，足以应对高级 Unity 开发岗位的面试。

---

## 1. 核心概念 (The Big Three)

### Q: 什么是 DI (依赖注入)？为什么不用 Singleton？
*   **A**:
    *   **DI** 是 "Don't call us, we'll call you"。我不主动 `new` 对象，我声明我需要什么，容器塞给我。
    *   **Singleton 的问题**：
        1.  **隐藏依赖**：`GameManager` 内部偷偷用了 `AudioManager.Instance`，外部看不出来。
        2.  **紧耦合**：无法替换实现（比如测试时换成 MockAudio）。
        3.  **生命周期失控**：很难控制谁先 Init，谁后 Init。
    *   **DI 的优势**：解耦、可测试、生命周期明确。

### Q: Zenject 的核心组件有哪些？
*   **Container (容器)**：大管家，负责存对象、创建对象。
*   **Installer (安装器)**：配置文件，告诉容器“谁绑定到谁”。
*   **Context (上下文)**：容器的生存范围（ProjectContext 全局，SceneContext 场景）。

---

## 2. 绑定类型 (Binding Types) —— 面试必问

### Q: `AsSingle` vs `AsTransient` vs `AsCached`？
*   **AsSingle (单例)**：整个 Context 里只有一份。
    *   `Container.Bind<IInput>().To<InputImpl>().AsSingle();`
*   **AsTransient (瞬态)**：每次注入都 `new` 一个新的。
    *   `Container.Bind<Bullet>().AsTransient();`
*   **AsCached (缓存)**：第一次 `new`，后面复用（类似单例，但范围更灵活）。

### Q: 如何绑定一个已经存在的 MonoBehaviour？
*   **FromComponentInHierarchy**：在场景里找。
*   **FromInstance**：直接把一个对象塞进去。
    *   `Container.BindInstance(myCamera);`

### Q: 什么是接口绑定 (Interface Binding)？
*   **写法**：`Container.BindInterfacesAndSelfTo<PlayerInput>();`
*   **作用**：让 `PlayerInput` 既能以 `PlayerInput` 类型注入，也能以它实现的接口（如 `ITickable`, `IInitializable`）注入。
*   **关键点**：如果不写这个，Zenject 不会调用它的 `Tick()`。

---

## 3. 高级特性 (Advanced Features) —— 加分项

### Q: 什么是 Factory (工厂)？为什么要用它？
*   **场景**：我在游戏运行时需要动态生成敌人 (Enemy)。
*   **错误写法**：在 Spawner 里注入 `Container`，然后调 `Container.InstantiatePrefab`。（这是 Service Locator 模式，反模式！）
*   **正确写法**：
    1.  定义 `class EnemyFactory : PlaceholderFactory<Enemy> {}`
    2.  Installer 里：`Container.BindFactory<Enemy, EnemyFactory>().FromComponentInNewPrefab(enemyPrefab);`
    3.  Spawner 里注入 `EnemyFactory`，调用 `factory.Create()`。

### Q: 什么是 Signal (信号)？
*   **作用**：解耦的事件系统（类似 EventBus）。
*   **优势**：比 C# event 更松散，支持 Command 模式（一个信号触发一个命令）。

### Q: 什么是 SubContainer (子容器)？
*   **场景**：玩家身上的装备系统。每个玩家有一个独立的容器，里面有独立的 `WeaponManager`。
*   **作用**：隔离作用域。玩家 A 的 WeaponManager 不会影响玩家 B。

---

## 4. 常见坑 (Common Pitfalls)

### Q: 循环依赖 (Circular Dependency) 怎么办？
*   **现象**：A 依赖 B，B 依赖 A。Zenject 会报错。
*   **解法**：
    1.  **重构**（推荐）：提取第三个类 C，让 A 和 B 都依赖 C。
    2.  **Lazy Inject**：`[Inject] Lazy<B> _b;`（延后获取）。
    3.  **Signal**：用信号解耦。

### Q: 为什么我的 `Tick()` 没执行？
*   **原因**：你实现了 `ITickable`，但 Bind 的时候只写了 `Bind<MyClass>()`，没写 `BindInterfacesTo()`。
*   **修正**：`Container.BindInterfacesAndSelfTo<MyClass>()`。

---

## 5. 你的项目实战话术 (Project Narrative)

**面试官**：你在项目中是怎么用 Zenject 的？

**你**：
> "在我的技能系统 Demo 中，我用 Zenject 重构了原本的 God Class (`GameClientManager`)。
>
> 1.  **架构分层**：我把输入 (`IInputService`) 和 UI (`IUIService`) 提取为独立服务。
> 2.  **启动流程**：用 `ProjectContext` 管理全局单例（如数据加载），用 `SceneContext` 管理场景逻辑。
> 3.  **并行开发**：为了保证重构安全，我采用了 Parallel 策略，保留旧 Manager 的同时，新建了 `GameBootstrapper` 作为 DI 入口，验证无误后再切换。
>
> 这不仅解决了耦合问题，更重要的是让我能单独对 Input 模块进行单元测试，而不需要启动整个游戏。"
