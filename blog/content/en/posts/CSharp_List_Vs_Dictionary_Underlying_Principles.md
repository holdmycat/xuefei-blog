---
title: "Underlying Principles of C# Collections: List vs Dictionary Implementation Analysis"
date: 2026-01-07T11:15:23+08:00
draft: false
tags: ["CSharp", "DotNet", "Performance", "DataStructures", "Interview"]
---

# Underlying Principles of C# Collections: List vs Dictionary Implementation Analysis

> This article systematically introduces the two most commonly used collections in C#: **List<T> and Dictionary<TKey, TValue>**, from four perspectives: **underlying data structures, time complexity, memory layout, and engineering practices**.

**Applicable for**:

- Unity / .NET Game Development
- Senior Engineer / Lead Programmer Interviews
- Performance-Sensitive System Design Reference

## I. Underlying Logic of List<T>

### 1. Essential Structure

**List<T> is essentially a Dynamic Array.**

Core fields (simplified):

```csharp
T[] _items;   // Contiguous memory array
int _size;    // Current number of elements
```

### 2. Memory Layout Characteristics

- Contiguous memory
- CPU Cache friendly
- Supports O(1) index access

### 3. Common Operation Complexity

| Operation | Time Complexity |
| :--- | :--- |
| Index Access | O(1) |
| Add (Tail) | Amortized O(1) |
| Insert (Middle) | O(n) |
| RemoveAt | O(n) |
| Iteration | O(n) |

### 4. Resizing Mechanism

When capacity is insufficient:

1. Create a larger array (usually 2x growth).
2. Copy old data to the new array.

### 5. Engineering Practice Suggestions

- **High-Frequency Iteration**: Prefer List or Array.
- **Pre-allocation**: If size is known, specify capacity at construction to avoid resizing costs.
- **Avoid Middle Operations**: Minimize frequent `Insert` or `RemoveAt` in the middle of the list.

## II. Underlying Logic of Dictionary<TKey, TValue>

### 1. Essential Structure

**Dictionary is a key-value mapping structure based on a Hash Table.**

It is composed of two arrays: **buckets** and **entries**.

### 2. Entry Structure (Simplified)

```csharp
struct Entry {
    int hashCode;
    int next;
    TKey key;
    TValue value;
}
```

### 3. Lookup Process

1. Calculate the **HashCode** of the Key.
2. Locate the **bucket** index using the HashCode.
3. Traverse the **collision chain** pointed to by the bucket.
4. Use `Equals` to compare Keys and find the target Entry.

### 4. Hash Collision & Performance

- Uses **Chaining** to resolve conflicts.
- If collisions are severe, lookup complexity degrades to O(n).

### 5. Resizing and Rehash

- Triggered when the element count exceeds a threshold.
- Requires re-calculating the bucket for **all Keys** (Rehash).
- **This is the most expensive operation in a Dictionary.**

### 6. Deletion Mechanism

- Does not immediately release memory; uses a **Freelist** mechanism to mark entries as available.
- Entries are reusable, but memory footprint doesn't shrink immediately.

## III. List vs Dictionary Comparison

| Dimension | List | Dictionary |
| :--- | :--- | :--- |
| **Underlying Structure** | Dynamic Array | Hash Table |
| **Memory Layout** | Contiguous | Non-contiguous |
| **Lookup** | Index O(1) | Hash O(1) |
| **Iteration** | Very Fast | Average |
| **Resizing Cost** | Array Copy | Full Rehash (Expensive) |

## IV. Game Development Practice Suggestions

1. **Update / Hot Paths**: Avoid using Dictionary; lookup and iteration have overhead.
2. **Pre-allocation**: Dictionary resizing is very expensive; specify Capacity in the constructor.
3. **Key Selection**: Avoid objects with slow `GetHashCode` (e.g., due to complex calculations or GC allocations).
4. **Alternatives**: If Keys are sequential integers, use an Array instead of a Dictionary.

## V. Interview One-Sentence Summary

- **List**: A dynamic array with contiguous memory, offering extremely high efficiency in access and iteration.
- **Dictionary**: A Key-Value structure based on a hash table, with average O(1) lookup, but requires attention to collision and resizing costs.

## Conclusion

Understanding the underlying implementation of collections is the foundation for writing high-performance, controllable systems.
