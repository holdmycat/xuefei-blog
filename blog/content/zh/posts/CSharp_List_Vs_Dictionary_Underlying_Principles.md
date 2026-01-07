---
title: "C# 集合底层原理：Dictionary 与 List 的实现机制解析"
date: 2026-01-07T11:15:23+08:00
draft: false
tags: ["CSharp", "DotNet", "Performance", "DataStructures", "Interview"]
---

# C# 集合底层原理：Dictionary 与 List 的实现机制解析

> 本文从 **底层数据结构、时间复杂度、内存布局与工程实践** 四个角度，系统性介绍 C# 中最常用的两种集合：**List<T> 与 Dictionary<TKey, TValue>**。

**适用场景**：

- Unity / .NET 游戏开发
- 高级工程师 / 主程面试
- 性能敏感系统设计参考

## 一、List<T> 的底层逻辑

### 1. 本质结构

**List<T> 本质上是一个动态数组（Dynamic Array）**。

核心字段（简化）：

```csharp
T[] _items;   // 连续内存数组
int _size;    // 当前元素数量
```

### 2. 内存布局特性

- 连续内存
- CPU Cache 友好
- 支持 O(1) 下标访问

### 3. 常见操作复杂度

| 操作 | 时间复杂度 |
| :--- | :--- |
| 索引访问 | O(1) |
| 尾部 Add | 均摊 O(1) |
| 中间 Insert | O(n) |
| RemoveAt | O(n) |
| 遍历 | O(n) |

### 4. 扩容机制

当容量不足时：

1. 创建更大的数组（通常为原容量的 2 倍）。
2. 将旧数据拷贝到新数组。

### 5. 工程实践建议

- **高频遍历**：优先使用 List 或 Array。
- **预分配容量**：如果能预估数量，构造时指定 capacity，避免扩容开销。
- **避免中间操作**：尽量避免频繁在中间 Insert 或 RemoveAt。

## 二、Dictionary<TKey, TValue> 的底层逻辑

### 1. 本质结构

**Dictionary 是基于哈希表（Hash Table）的键值映射结构**。

由 buckets（桶）与 entries（实体）两组数组构成。

### 2. Entry 结构（简化）

```csharp
struct Entry {
    int hashCode;
    int next;
    TKey key;
    TValue value;
}
```

### 3. 查找流程

1. 计算 Key 的 **HashCode**。
2. 通过 HashCode 定位到 **bucket**。
3. 遍历 bucket 指向的 **冲突链**。
4. 使用 Equals 比较 Key 找到目标 Entry。

### 4. 哈希冲突与性能

- 使用 **链地址法** 解决冲突。
- 如果冲突严重，查找复杂度会退化为 O(n)。

### 5. 扩容与 Rehash

- 当元素数量超过阈值时触发扩容。
- 需要重新计算所有 Key 的 bucket 位置（Rehash）。
- **这是 Dictionary 开销最大的操作**。

### 6. 删除机制

- 并不立即释放内存，而是使用 **Freelist** 机制标记空闲 Entry。
- 可复用但内存占用不会立即减少。

## 三、List 与 Dictionary 对比

| 维度 | List | Dictionary |
| :--- | :--- | :--- |
| **底层结构** | 动态数组 | 哈希表 |
| **内存布局** | 连续 | 非连续 |
| **查找** | 索引 O(1) | 哈希 O(1) |
| **遍历** | 非常快 | 一般 |
| **扩容代价** | 数组拷贝 | 全量 Rehash (昂贵) |

## 四、游戏开发实践建议

1. **Update / 热路径**：尽量避免使用 Dictionary，查找和迭代开销较高。
2. **预分配**：Dictionary 的扩容成本极高，尽量在构造时指定 Capacity。
3. **Key 的选择**：避免使用因为 GC 或复杂计算导致 HashCode 慢的对象作为 Key。
4. **替代方案**：如果 Key 是连续整数，用数组代替 Dictionary。

## 五、面试一句话总结

- **List** 是连续内存的动态数组，访问与遍历效率极高。
- **Dictionary** 是基于哈希表的 Key-Value 结构，查找平均 O(1)，但需关注冲突与 Rehash 成本。

## 结语

理解集合底层实现，是写出高性能、可控系统的基础。
