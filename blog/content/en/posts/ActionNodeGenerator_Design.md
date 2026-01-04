---
title: "Action Node Generator Tool Design"
date: 2026-01-04T10:05:00+08:00
draft: false
tags: ["Tool", "Editor", "Unity"]
---

## 1. Problem Background

In the existing Behavior Tree (NPBehave) system, creating a new Action node requires cumbersome manual steps:

1. **Create Action Script**: Inherit from `NP_ClassForStoreAction` and implement logic.
2. **Create Node Script**: Inherit from `NP_TaskNodeBase`, configure the Menu path, and associate Action data.
3. **Path and Naming Conventions**: Strict adherence to specific folder structures and naming rules is required, which is error-prone.

This repetitive and error-prone manual process reduces development efficiency, necessitating an automated tool to solve this problem.

## 2. Requirements Analysis

### 2.1 Core Features

Users configure parameters in the Editor interface and generate two corresponding scripts with one click:

1. **Action Script** (`NP_{Name}Action.cs`): Responsible for the actual logic.
2. **Node Script** (`NP_{Name}ActionNode.cs`): Responsible for display and configuration in the Graph Editor.

### 2.2 Input Parameters

- **Action Name**: User-defined name (e.g., `LogDebug`), automatically appending prefix and suffix.
- **Namespace**: `GamePlay` or `DataCtrl`.
- **Override Type**: Select the interface method to override (`GetActionToBeDone`, `GetFuncToBeDone`, etc.).
- **Menu Hierarchy**: Three-level menu structure.
    1. **Tree Type**: Type of the tree (e.g., `SlgSquad`).
    2. **Node Type**: Type of the node (e.g., `Task`).
    3. **Action Category**: Functional category (e.g., `NpBehave`, `System`, `Transform`, etc.).

### 2.3 Generation Rules

#### 2.3.1 Action Script

- **Base Class**: `NP_ClassForStoreAction`
- **Naming**: `NP_{Name}Action`
- **Path**:
  - Namespace = `GamePlay` -> `Assets/Scripts/GamePlay/TheDataContainsAction/{Category}/`
  - Namespace = `DataCtrl` -> `Assets/Scripts/DataCtrl/NPData/TheDataContainsAction/{Category}/`
    *(Note: If the category folder does not exist, it should be created automatically)*

#### 2.3.2 Node Script

- **Base Class**: `NP_TaskNodeBase`
- **Naming**: `NP_{Name}ActionNode`
- **Path**: `Assets/Plugins/NodeEditor/Examples/Editor/Nodes/{Category}/` *(Specific mapping path needs to be confirmed)*
- **MenuItem**: `[NodeMenuItem("{TreeType}/{NodeType}/{Category}/{Description}", typeof({GraphType}))]`

## 3. UI Design

Tool Window Class Name: `ActionNodeGeneratorWindow`

**Layout:**

- **Header**: "Action Node Generator"
- **Input Group**:
  - `Base Name`: [TextField] (e.g., "AttackTarget")
  - `Description`: [TextField] (e.g., "Attack Target")
- **Configuration Group**:
  - `Namespace`: [Enum: GamePlay, DataCtrl]
  - `Override Method`: [Enum: Action, Func, Func1, Func2]
- **Menu Hierarchy Group**:
  - `Tree Type`: [Enum: SlgSquad, ...]
  - `Node Type`: [Enum: Task, ...]
  - `Category`: [Enum: System, NpBehave, Transform, ...]
- **Button**: "Generate Scripts"

## 4. Implementation Details

### 4.1 Data Structure

Define unified configuration enums for easy extension:

```csharp
public enum ActionNamespace { GamePlay, DataCtrl }
public enum OverrideType { GetActionToBeDone, GetFuncToBeDone, GetFunc1ToBeDone, GetFunc2ToBeDone }
public enum TreeType { SlgSquad }
public enum NodeType { Task }
// Extend Category enum to match file paths
public enum ActionCategory { NpBehave, System, Transform, Camera, Audio, Collider, Time, Buff }
```

### 4.2 Template Generation

Use simple string replacement (String.Replace) to generate code.

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
