---
title: "Blackboard Data Loss Issue Record"
date: 2026-01-04T15:58:00+08:00
draft: false
tags: ["Architecture", "BugFix", "Serialization", "Unity"]
---

## 1. Phenomenon

In the Unity Editor, after modifying Blackboard data in the Behavior Tree (e.g., setting the boolean `IsGetBirth` to `true`) and saving the Asset:

- Entering and exiting Play mode, or restarting the editor.
- Checking the Behavior Tree asset again reveals that the Blackboard dictionary is empty, or the previously modified values have reset to their default values (e.g., `false`).

## 2. Cause Analysis

- **Serialization Mechanism**:
  - Although `NP_BlackBoardDataManager` implements the `ISerializationCallbackReceiver` interface and attempts to convert the `Dictionary` to a `List` for storage during serialization.
  - However, the element type in the list is the base class `ANP_BBValue`.
- **Missing Attribute**:
  - The base class `ANP_BBValue` was **not marked** with `[System.Serializable]`.
  - Unity's built-in serializer (JsonUtility or Inspector serialization), when handling polymorphic lists or lists of reference types, will ignore the serialized data of elements if the element type lacks the Serializable attribute.
- **Result**:
  - Upon saving, the dictionary is converted to a list. Although `ANP_BBValue` objects in the list are created, their internal fields (like `Value`) may not be correctly serialized or cannot be restored during deserialization.

## 3. Solution

Explicitly add the `[System.Serializable]` attribute to the `ANP_BBValue` base class.

```csharp
namespace Ebonor.DataCtrl
{
    [System.Serializable] // <--- Added this
    public abstract class ANP_BBValue
    {
        public abstract Type NP_BBValueType { get; }
        // ...
    }
}
```

After this modification, performing the "Set Value -> Save" operation again allows Unity to correctly recognize and serialize the Blackboard entries, persisting the data successfully.
