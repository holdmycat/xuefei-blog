---
title: "SLG UI 架构设计：基于 Zenject 的 MVVM 实践"
date: 2025-12-28
draft: false
tags: ["Architecture", "Zenject", "Unity", "UI", "SLG"]
---

# Zenject-based SLG UI Architecture

针对 SLG (策略类游戏) 的复杂度和 Zenject 框架的特性，推荐采用 **MVVM (Model-View-ViewModel)** 或 **MVP (Model-View-Presenter)** 架构。核心目标是实现 **数据与表现分离**，利用 Zenject 进行依赖注入和生命周期管理。

## 1. 核心分层架构

整体架构分为三层：

### A. Model (数据层)

**职责**: 存储纯数据，不含游戏逻辑，不引用 Unity View。

* **内容**: `NumericComponent`, `ConfigData`, `RuntimeState` (如 `ShowcaseContext`).
* **Zenject 绑定**: 通常绑定为 `AsSingle` (全局单例或场景单例)。
* **示例**:

    ```csharp
    // ShowcaseContext.cs (DataCtrl)
    public class ShowcaseContext {
        public Dictionary<int, UnitData> Units; // 纯数据
    }
    ```

### B. ViewModel / Presenter (逻辑层)

**职责**: 处理 UI 逻辑，从 Model 获取数据并格式化，响应 View 的输入事件。

* **内容**: 纯 C# 类，持有 Model 的引用。
* **Zenject 绑定**:
  * **Transient**: 每次打开 UI 创建一个新的 (适合弹窗)。
  * **Cached**: 如果希望保持状态，可绑定为 Single。
* **示例**:

    ```csharp
    public class TroopInfoViewModel {
        private ShowcaseContext _context;
        
        [Inject]
        public TroopInfoViewModel(ShowcaseContext context) {
            _context = context;
        }

        public string GetHealthText(int netId) {
            var data = _context.GetData(netId);
            return $"{data.CurrentHp} / {data.MaxHp}";
        }
    }
    ```

### C. View (表现层 / UI Prefab)

**职责**: 仅负责显示 (赋值 Text, Image) 和 转发输入 (Button Click)。

* **内容**: `MonoBehaviour`，挂载在 UI Prefab 上。
* **Zenject 绑定**: 不直接绑定，而是通过 `UIManager` 使用 `_container.InstantiatePrefabForComponent` 实例化，从而支持由 Zenject 自动注入 ViewModel。
* **示例**:

    ```csharp
    public class UIScene_TroopInfo : MonoBehaviour {
        [Inject] private TroopInfoViewModel _viewModel; // 注入逻辑层

        public void Refresh(int netId) {
            healthText.text = _viewModel.GetHealthText(netId);
        }
    }
    ```

---

## 2. 关键基础设施

为了支撑上述架构，需要以下基础设施：

### UIManager (UI 管理器)

* **必须集成 Zenject**: 使用 `DiContainer.InstantiatePrefabForComponent` 代替 `Instantiate`。
* 这是让 UI Prefab 能够使用 `[Inject]` 的关键。(已修复)

### Event Bus (事件总线)

* **SignalBus**: 使用 Zenject 自带的 SignalBus 处理跨层通讯。
  * Data Layer 发生变化 -> Fire Signal.
  * ViewModel Listen Signal -> Update View.

## 3. SLG 特有场景的最佳实践

1. **海量单位刷新**: 不要在 Update 中遍历所有单位。使用事件驱动 (Signal)。数据层仅通知"ID为X的单位数据变了"，UI 仅刷新该条目。
2. **多级弹窗管理**: SLG 界面层级深。使用 `UIManager` 维护一个 `Stack<UIBase>`，处理“返回”按钮逻辑。
3. **动态列表**: 对于背包/兵力列表，使用对象池 (Zenject `MemoryPool`) 来管理列表项 (ItemView)，列表项本身也应支持 Injection。

## 4. MVVM vs MVP: 深度对比与选择

在 Unity 开发中，两者核心目的都是为了分离 **视图(View)** 和 **逻辑(Logic)**，但实现方式不同。

### MVP (Model-View-Presenter)

* **交互方式**: View 是被动的 (Passive View)。
* **流程**:
    1. View 接收用户输入 -> 调用 Presenter。
    2. Presenter 处理业务逻辑，更新 Model。
    3. Presenter **显式调用** View 的接口 (如 `view.SetHealth(100)`) 来更新 UI。
* **优点**:
  * 逻辑清晰，流程易追踪 (线性代码)。
  * 不依赖复杂的绑定框架，性能通常更好（无反射开销）。
  * 更容易调试 (Debug)。
* **缺点**:
  * Presenter 和 View 耦合度较高 (Presenter 需要持有 View 接口)。
  * 需要写大量的 `UpdateUI()` 样板代码。
* **适用场景**:
  * **高性能要求高** 的系统 (如每帧更新的战斗 HUD)。
  * 不希望引入 Reactive/Binding 库 (如 UniRx, R3) 的项目。
  * 团队偏向传统 OOP 编程风格。

### MVVM (Model-View-ViewModel)

* **交互方式**: View 是主动的，通过 **数据绑定 (Data Binding)** 监听 ViewModel。
* **流程**:
    1. View 绑定到 ViewModel 的属性 (如 `HealthProperty`)。
    2. ViewModel 处理逻辑，更新属性值 (Reactive Property)。
    3. View 自动检测到变化并更新自身。
* **优点**:
  * **解耦更彻底**: ViewModel 完全不知道 View 的存在。
  * 开发效率高，减少样板代码 (自动同步)。
  * View 可以轻易更换而无需修改 ViewModel。
* **缺点**:
  * 增加了调试难度 (数据流是隐式的)。
  * 通常需要引入响应式框架 (UniRx, R3, Zenject Signals)。
  * 有一定的性能开销 (GC, 事件监听)。
* **适用场景**:
  * **交互复杂、表单多** 的界面 (如 SLG 的内政界面、设置页、英雄详情页)。
  * 数据状态驱动的 UI。
  * 希望实现 View 和 Logic 并行开发的团队。

### 针对本项目的建议

考虑到 SLG 的重数据特性和 Zenject 环境：

* **推荐模式**: **MVP** (配合 Zenject) 或 **简化的 MVVM** (使用 SignalBus 代替复杂的绑定)。
* **理由**: SLG 核心逻辑复杂，MVP 的明确控制流更容易定位 Bug。如果你引入了 UniRx，可以尝试 MVVM；如果只想保持轻量，MVP + SignalBus 是最稳健的选择。

## 7. 多级 UI 与弹窗的处理策略 (Nested UI & Popups)

在 SLG 中，界面层级通常很深。MVVM 处理原则如下：

### A. 独立弹窗 (Popups/Windows)

* **定义**: 由 `UIManager` 打开的独立界面（如“武将详情弹窗”）。
* **ViewModel**: 拥有独立的 ViewModel (e.g., `CommanderDetailViewModel`)。
* **数据传递**:
    1. **OpenUI 参数**: `UIManager.OpenUI<CommanderDetailUI>(ui => ui.SetInitData(commanderId))`。
    2. **ViewModel 初始化**: UI 收到参数后，传递给 ViewModel，ViewModel 再去 Context 取数据。

### B. 子视图/控件 (Sub-views/Widgets)

* **定义**: 镶嵌在主界面内的复杂组件（如“顶部资源条”、“底部菜单”、“兵力卡片”）。
* **策略**:
  * **简单组件**: 直接使用 Parent ViewModel 的数据。
  * **复杂组件**: 拥有自己的 `SubViewModel`。Parent ViewModel 负责创建并持有这个 SubViewModel，传给 Child View。

## 8. ClientRuntimeData 详解 (Runtime State)

**为什么要引入它？**
`ShowcaseContext` 存放的是**“客观存在的服务器数据”**（如兵力值）。
但在客户端，还需要存储**“主观的操作状态”**（如“玩家当前选中了哪个单位”、“当前的过滤筛选模式”）。这些不属于服务器数据，但需要跨界面共享。

### 实现方式

1. **定义**: 创建 `ClientRuntimeContext : IContext`。
2. **绑定**: `Container.Bind<ClientRuntimeContext>().AsSingle()`。
3. **使用**:
    * `MapViewModel` 写入: `_runtimeContext.SelectedUnitId = 1001;`
    * `UnitDetailViewModel` 读取: `var id = _runtimeContext.SelectedUnitId;`
4. **通讯**: 配合 SignalBus。当 `SelectedUnitId` 变化时，发出 `Signal_UnitSelected`，感兴趣的 UI 自动刷新。

## 9. 总结

通过这种架构：

* **UI** 变得很薄，只负责显示。
* **逻辑** 集中在 ViewModel，方便测试和复用。
* **数据** 集中在 Context/Model，严格与表现隔离。
* **Zenject** 负责将它们粘合在一起，自动处理依赖。
