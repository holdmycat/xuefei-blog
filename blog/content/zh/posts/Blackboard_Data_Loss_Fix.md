---
title: "黑板数据丢失问题记录"
date: 2026-01-04T15:58:00+08:00
draft: false
tags: ["Architecture", "BugFix", "Serialization", "Unity"]
---

## 1. 现象 (Phenomenon)

在 Unity 编辑器中，修改行为树黑板（Blackboard）的数据（例如将 `IsGetBirth` 布尔值设为 `true`），保存资产 (=Asset) 后。

- 进入 Play 模式再退出，或者重启编辑器。
- 再次查看该行为树资产，发现黑板字典变空，或者之前修改的值被重置为默认值（如 `false`）。

## 2. 原因分析 (Cause Analysis)

- **序列化机制**：
  - `NP_BlackBoardDataManager` 虽然实现了 `ISerializationCallbackReceiver` 接口，试图在序列化时将 `Dictionary` 转换为 `List` 进行存储。
  - 但是，列表中的元素类型是基类 `ANP_BBValue`。
- **缺失的标记**：
  - 基类 `ANP_BBValue` **未标记** `[System.Serializable]`。
  - Unity 的内置序列化器（JsonUtility 或 Inspector 序列化）在处理多态列表或引用类型列表时，如果元素类型没有 Serializable 标记，它将忽略该元素的序列化数据。
- **结果**：
  - 保存时，字典被转为列表，但列表里的 `ANP_BBValue` 对象虽然被创建了，其内部字段（如 `Value`）可能未被正确序列化，或者在反序列化时无法恢复。

## 3. 解决方案 (Solution)

在 `ANP_BBValue` 基类上显式添加 `[System.Serializable]` 特性。

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

修改后，重新操作一次“设置值 -> 保存”，Unity 就能正确识别并序列化黑板条目，数据得以持久化保留。
