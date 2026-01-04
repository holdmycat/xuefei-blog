---
title: "Action Node Generator Tool Design"
date: 2026-01-04T10:05:00+08:00
draft: false
tags: ["Tool", "Editor", "Unity"]
---

## 1. 问题背景 (Problem Background)

在现有的行为树 (NPBehave) 系统中，创建一个新的 Action 节点需要繁琐的手动步骤：

1. **创建 Action 脚本**：继承 `NP_ClassForStoreAction`，实现逻辑。
2. **创建 Node 脚本**：继承 `NP_TaskNodeBase`，配置 Menu 路径，关联 Action 数据。
3. **路径与命名规范**：需要严格遵守特定的文件夹结构和命名规则，容易出错。

这种重复且易错的手工流程降低了开发效率，因此需要一个自动化工具来解决此问题。

## 2. 需求分析 (Requirements Analysis)

### 2.1 核心功能

用户在 Editor 界面配置好参数后，一键生成两个对应脚本：

1. **Action 脚本** (`NP_{Name}Action.cs`)：负责实际逻辑。
2. **Node 脚本** (`NP_{Name}ActionNode.cs`)：负责在 Graph Editor 中显示和配置。

### 2.2 输入参数

- **Action Name**：用户自定义名称（如 `LogDebug`），自动拼接前缀后缀。
- **Namespace**：`GamePlay` 或 `DataCtrl`。
- **Override Type**：选择需要重写的接口方法（`GetActionToBeDone`, `GetFuncToBeDone` 等）。
- **Menu Hierarchy**：三级菜单结构。
    1. **Tree Type**：树的类型 (e.g., `SlgSquad`)。
    2. **Node Type**：节点类型 (e.g., `Task`)。
    3. **Action Category**：功能分类 (e.g., `NpBehave`, `System`, `Transform`, etc.)。

### 2.3 生成规则

#### 2.3.1 Action 脚本

- **基类**：`NP_ClassForStoreAction`
- **命名**：`NP_{Name}Action`
- **路径**：
  - Namespace = `GamePlay` -> `Assets/Scripts/GamePlay/TheDataContainsAction/{Category}/`
  - Namespace = `DataCtrl` -> `Assets/Scripts/DataCtrl/NPData/TheDataContainsAction/{Category}/`
    *(注：如果类别文件夹不存在，需自动创建)*

#### 2.3.2 Node 脚本

- **基类**：`NP_TaskNodeBase`
- **命名**：`NP_{Name}ActionNode`
- **路径**：`Assets/Plugins/NodeEditor/Examples/Editor/Nodes/{Category}/` *(需确认具体的映射路径)*
- **MenuItem**：`[NodeMenuItem("{TreeType}/{NodeType}/{Category}/{Description}", typeof({GraphType}))]`

## 3. UI 设计 (UI Design)

工具窗口类名：`ActionNodeGeneratorWindow`

**Layout:**

- **Header**: "Action Node Generator"
- **Input Group**:
  - `Base Name`: [TextField] (e.g., "AttackTarget")
  - `Description`: [TextField] (e.g., "攻击目标")
- **Configuration Group**:
  - `Namespace`: [Enum: GamePlay, DataCtrl]
  - `Override Method`: [Enum: Action, Func, Func1, Func2]
- **Menu Hierarchy Group**:
  - `Tree Type`: [Enum: SlgSquad, ...]
  - `Node Type`: [Enum: Task, ...]
  - `Category`: [Enum: System, NpBehave, Transform, ...]
- **Button**: "Generate Scripts"

## 4. 实现细节 (Implementation Details)

### 4.1 数据结构

定义统一的配置枚举，方便扩展：

```csharp
public enum ActionNamespace { GamePlay, DataCtrl }
public enum OverrideType { GetActionToBeDone, GetFuncToBeDone, GetFunc1ToBeDone, GetFunc2ToBeDone }
public enum TreeType { SlgSquad }
public enum NodeType { Task }
// 扩展 Category 枚举以匹配文件路径
public enum ActionCategory { NpBehave, System, Transform, Camera, Audio, Collider, Time, Buff }
```

### 4.2 模板生成

使用简单的字符串替换 (String.Replace) 生成代码。

**Action Template:**

```csharp
using Ebonor.DataCtrl;
using Ebonor.Framework;
using UnityEngine;
// NAMESPACE_IMPORT

namespace Ebonor.NAMESPACE
{
    [System.Serializable]
    public class CLASS_NAME : NP_ClassForStoreAction
    {
        // OVERRIDE_METHOD
        public override System.Action GetActionToBeDone()
        {
            return null; // TODO: Implement logic
        }
    }
}
```

**Node Template:**

```csharp
using GraphProcessor;
using Ebonor.DataCtrl;
using Ebonor.GamePlay;
// NAMESPACE_IMPORT

namespace Plugins.NodeEditor
{
    [NodeMenuItem("MENU_PATH", typeof(GRAPH_TYPE))]
    public class CLASS_NAME_NODE : NP_TaskNodeBase
    {
        public override string name => "NODE_DESC";
        
        public NP_ActionNodeData NP_ActionNodeData =
            new NP_ActionNodeData()
            {
                NpClassForStoreAction = new CLASS_NAME(),
                NodeDes = "NODE_DESC"
            };
        
        public override NP_NodeDataBase NP_GetNodeData()
        {
            return NP_ActionNodeData;
        }
    }
}
```
