---
title: "SLG UI Architecture Design: Zenject-Based MVVM Practice"
date: 2025-12-28
draft: false
tags: ["Architecture", "Zenject", "Unity", "UI", "SLG"]
---

# Zenject-based SLG UI Architecture

Given the complexity of SLG (Strategy Games) and the features of the Zenject framework, adopting **MVVM (Model-View-ViewModel)** or **MVP (Model-View-Presenter)** architecture is recommended. The core goal is to achieve **separation of data and presentation**, leveraging Zenject for dependency injection and lifecycle management.

## 1. Core Layered Architecture

The overall architecture is divided into three layers:

### A. Model (Data Layer)

**Responsibility**: Stores pure data, contains no game logic, and does not reference Unity Views.

* **Content**: `NumericComponent`, `ConfigData`, `RuntimeState` (e.g., `ShowcaseContext`).
* **Zenject Binding**: Usually bound as `AsSingle` (Global Singleton or Scene Singleton).
* **Example**:

    ```csharp
    // ShowcaseContext.cs (DataCtrl)
    public class ShowcaseContext {
        public Dictionary<int, UnitData> Units; // Pure Data
    }
    ```

### B. ViewModel / Presenter (Logic Layer)

**Responsibility**: Handles UI logic, retrieves and formats data from Model, and responds to input events from View.

* **Content**: Pure C# class, holds a reference to Model.
* **Zenject Binding**:
  * **Transient**: Created each time the UI is opened (suitable for popups).
  * **Cached**: Bound as Single if state maintenance is desired.
* **Example**:

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

### C. View (Presentation Layer / UI Prefab)

**Responsibility**: Only responsible for display (assigning Text, Image) and forwarding input (Button Click).

* **Content**: `MonoBehaviour`, attached to UI Prefab.
* **Zenject Binding**: Not directly bound, but instantiated using `UIManager` with `_container.InstantiatePrefabForComponent`, allowing Zenject to automatically inject ViewModel.
* **Example**:

    ```csharp
    public class UIScene_TroopInfo : MonoBehaviour {
        [Inject] private TroopInfoViewModel _viewModel; // Injected Logic Layer

        public void Refresh(int netId) {
            healthText.text = _viewModel.GetHealthText(netId);
        }
    }
    ```

---

## 2. Key Infrastructure

To support the above architecture, the following infrastructure is required:

### UIManager

* **Must Integrate with Zenject**: Use `DiContainer.InstantiatePrefabForComponent` instead of `Instantiate`.
* This is key to allowing UI Prefabs to use `[Inject]`. (Fixed)

### Event Bus

* **SignalBus**: Use Zenject's built-in SignalBus for cross-layer communication.
  * Data Layer Changes -> Fire Signal.
  * ViewModel Listens Signal -> Update View.

## 3. Best Practices for SLG-Specific Scenarios

1. **Massive Unit Refresh**: Do not iterate through all units in Update. Use Event-Driven (Signal) approach. Data layer only notifies "Unit ID X data changed", UI only refreshes that specific entry.
2. **Multi-Level Popup Management**: SLG interfaces have deep hierarchies. Use `UIManager` to maintain a `Stack<UIBase>` to handle "Back" button logic.
3. **Dynamic Lists**: For inventory/troop lists, use Object Pooling (Zenject `MemoryPool`) to manage list items (ItemView), and the list items themselves should support Injection.

## 4. MVVM vs MVP: Deep Comparison and Choice

In Unity development, both aim to separate **View** and **Logic**, but implementation differs.

### MVP (Model-View-Presenter)

* **Interaction**: View is Passive.
* **Flow**:
    1. View receives user input -> Calls Presenter.
    2. Presenter processes business logic, updates Model.
    3. Presenter **explicitly calls** View interface (e.g., `view.SetHealth(100)`) to update UI.
* **Pros**:
  * Clear logic, easy to trace flow (linear code).
  * Does not rely on complex binding frameworks, usually better performance (no reflection overhead).
  * Easier to Debug.
* **Cons**:
  * High coupling between Presenter and View (Presenter needs to hold View interface).
  * Requires writing a lot of `UpdateUI()` boilerplate code.
* **Applicable Scenarios**:
  * Systems with **High Performance Requirements** (e.g., Combat HUD updated every frame).
  * Projects wishing to avoid Reactive/Binding libraries (like UniRx, R3).
  * Teams preferring traditional OOP programming style.

### MVVM (Model-View-ViewModel)

* **Interaction**: View is Active, listening to ViewModel via **Data Binding**.
* **Flow**:
    1. View binds to properties of ViewModel (e.g., `HealthProperty`).
    2. ViewModel processes logic, updates property values (Reactive Property).
    3. View detects changes and updates itself automatically.
* **Pros**:
  * **Complete Decoupling**: ViewModel is unaware of View's existence.
  * High development efficiency, reduced boilerplate (auto-sync).
  * View can be easily swapped without modifying ViewModel.
* **Cons**:
  * Increased debugging difficulty (implicit data flow).
  * Usually requires introducing reactive frameworks (UniRx, R3, Zenject Signals).
  * Some performance overhead (GC, Event Listening).
* **Applicable Scenarios**:
  * Interfaces with **Complex Interactions, Many Forms** (e.g., SLG Governance, Settings, Hero Details).
  * Data-state driven UI.
  * Teams wishing to implement parallel development of View and Logic.

### Recommendation for This Project

Considering the data-heavy nature of SLG and the Zenject environment:

* **Recommended Mode**: **MVP** (with Zenject) or **Simplified MVVM** (using SignalBus instead of complex binding).
* **Reason**: SLG core logic is complex, and MVP's explicit control flow makes it easier to locate Bugs. If you introduce UniRx, you can try MVVM; if you want to keep it lightweight, MVP + SignalBus is the most robust choice.

## 7. Handling Multi-Level UI and Popups (Nested UI & Popups)

In SLG, interface hierarchies are typically deep. MVVM handling principles are as follows:

### A. Independent Popups (Popups/Windows)

* **Definition**: Independent interfaces opened by `UIManager` (e.g., "Commander Detail Popup").
* **ViewModel**: Has an independent ViewModel (e.g., `CommanderDetailViewModel`).
* **Data Passing**:
    1. **OpenUI Parameters**: `UIManager.OpenUI<CommanderDetailUI>(ui => ui.SetInitData(commanderId))`.
    2. **ViewModel Initialization**: UI receives parameters, passes to ViewModel, ViewModel then fetches data from Context.

### B. Sub-views/Widgets

* **Definition**: Complex components embedded in the main interface (e.g., "Top Resource Bar", "Bottom Menu", "Troop Card").
* **Strategy**:
  * **Simple Components**: Directly use Parent ViewModel's data.
  * **Complex Components**: Have their own `SubViewModel`. Parent ViewModel is responsible for creating and holding this SubViewModel, passing it to Child View.

## 8. ClientRuntimeData Explained (Runtime State)

**Why Introduce It?**
`ShowcaseContext` stores **"Objectively Existing Server Data"** (like troop counts).
But on the client, we also need to store **"Subjective Operation States"** (like "Which unit is currently selected by the player", "Current filter mode"). These are not server data but need to be shared across interfaces.

### Implementation

1. **Definition**: Create `ClientRuntimeContext : IContext`.
2. **Binding**: `Container.Bind<ClientRuntimeContext>().AsSingle()`.
3. **Usage**:
    * `MapViewModel` write: `_runtimeContext.SelectedUnitId = 1001;`
    * `UnitDetailViewModel` read: `var id = _runtimeContext.SelectedUnitId;`
4. **Communication**: Combined with SignalBus. When `SelectedUnitId` changes, fire `Signal_UnitSelected`, interested UIs refresh automatically.

## 9. Summary

Through this architecture:

* **UI** becomes thin, only responsible for display.
* **Logic** is centralized in ViewModel, facilitating testing and reuse.
* **Data** is centralized in Context/Model, strictly isolated from presentation.
* **Zenject** is responsible for gluing them together, automatically handling dependencies.
