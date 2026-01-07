---
title: "C# 集合底层原理：Dictionary 与 List 的实现机制解析"
date: 2026-01-07T11:09:04+08:00
draft: false
tags: ["CSharp", "DotNet", "Performance", "DataStructures", "Interview"]
---

# C# 集合底层原理：Dictionary 与 List 的实现机制解析

> 本文从 **底层数据结构、时间复杂度、内存布局与工程实践** 四个角度，
> 系统性介绍 C# 中最常用的两种集合：
> **List<T> 与 Dictionary<TKey, TValue>**。

> 适用于：
>
> - Unity / .NET 游戏开发
> - 高级工程师 / 主程面试
> - 性能敏感系统设计参考

---

## 一、List<T> 的底层逻辑

### 1. 本质结构

**List<T> 本质上是一个动态数组（Dynamic Array）**

核心字段（简化）：

```csharp
T[] _items;   // 连续内存数组
int _size;    // 当前元素数量
```

---

### 2. 内存布局特性

- 连续内存
- CPU Cache 友好
- 支持 O(1) 下标访问

---

### 3. 常见操作复杂度

| 操作 | 时间复杂度 |
|----|----|
| 索引访问 | O(1) |
| 尾部 Add | 均摊 O(1) |
| 中间 Insert | O(n) |
| RemoveAt | O(n) |
| 遍历 | O(n) |

---

### 4. 扩容机制

容量不足时：

- 创建更大的数组
- 拷贝旧数据

扩容通常按 2 倍增长。

---

### 5. 工程实践建议

- 高频遍历优先 List / Array
- 明确容量时预分配
- 避免中间频繁插入删除

---

## 二、Dictionary<TKey, TValue> 的底层逻辑

### 1. 本质结构

**Dictionary 是基于哈希表（Hash Table）的键值映射结构**

由 buckets 与 entries 两组数组构成。

---

### 2. Entry 结构（简化）

```csharp
struct Entry {
    int hashCode;
    int next;
    TKey key;
    TValue value;
}
```

---

### 3. 查找流程

1. 计算 hashCode
2. 定位 bucket
3. 遍历冲突链
4. 比较 Equals

---

### 4. 哈希冲突与性能

- 使用链式结构解决冲突
- 冲突严重会退化为 O(n)

---

### 5. 扩容与 Rehash

- 当元素数量超过阈值触发
- 所有 Key 重新计算 bucket
- 是 Dictionary 最重的操作

---

### 6. 删除机制

- 使用墓碑与 freeList
- Entry 可复用但不立即释放

---

## 三、List 与 Dictionary 对比

| 维度 | List | Dictionary |
|----|----|----|
| 底层结构 | 动态数组 | 哈希表 |
| 内存布局 | 连续 | 非连续 |
| 查找 | 索引 | 哈希 |
| 遍历 | 很快 | 一般 |
| 扩容代价 | 数组拷贝 | 全量 Rehash |

---

## 四、游戏开发实践建议

- Update / 热路径避免 Dictionary
- 提前预分配容量
- Key 设计决定 Dictionary 性能
- 能用数组就不用哈希

---

## 五、面试一句话总结

List 是连续内存的动态数组，访问与遍历效率极高；  
Dictionary 是基于哈希表的 Key-Value 结构，查找平均 O(1)，但需要关注冲突与扩容成本。

---

## 结语

理解集合底层实现，是写出高性能、可控系统的基础。
