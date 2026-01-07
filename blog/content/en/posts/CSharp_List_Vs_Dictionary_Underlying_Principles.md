---
title: "Underlying Principles of C# Collections: List vs Dictionary Implementation Analysis"
date: 2026-01-07T11:11:46+08:00
draft: false
tags: ["CSharp", "DotNet", "Performance", "DataStructures", "Interview"]
---

# Underlying Principles of C# Collections: List vs Dictionary Implementation Analysis

> This article systematically introduces the two most commonly used collections in C#: **List<T> and Dictionary<TKey, TValue>**, from four perspectives: **underlying data structures, time complexity, memory layout, and engineering practices**.

> Applicable for:
>
> - Unity / .NET Game Development
> - Senior Engineer / Lead Programmer Interviews
> - Performance-Sensitive System Design Reference

---

## I. Underlying Logic of List<T>

### 1. Essential Structure

**List<T> is essentially a Dynamic Array.**

Core fields (simplified):

```csharp
T[] _items;   // Contiguous memory array
int _size;    // Current number of elements
```

---

### 2. Memory Layout Characteristics

- Contiguous memory
- CPU Cache friendly
- Supports O(1) index access

---

### 3. Common Operation Complexity

| Operation | Time Complexity |
|----|----|
| Index Access | O(1) |
| Add (Tail) | Amortized O(1) |
| Insert (Middle) | O(n) |
| RemoveAt | O(n) |
| Iteration | O(n) |

---

### 4. Resizing Mechanism

When capacity is insufficient:

- Create a larger array
- Copy old data

Resizing typically grows by a factor of 2.

---

### 5. Engineering Practice Suggestions

- Prefer List / Array for high-frequency iteration
- Pre-allocate capacity when size is known
- Avoid frequent insertions and deletions in the middle

---

## II. Underlying Logic of Dictionary<TKey, TValue>

### 1. Essential Structure

**Dictionary is a key-value mapping structure based on a Hash Table.**

It is composed of two arrays: buckets and entries.

---

### 2. Entry Structure (Simplified)

```csharp
struct Entry {
    int hashCode;
    int next;
    TKey key;
    TValue value;
}
```

---

### 3. Lookup Process

1. Calculate hashCode
2. Locate bucket
3. Traverse collision chain
4. Compare using Equals

---

### 4. Hash Collision & Performance

- Uses chaining to resolve conflicts
- Severe conflicts can degrade performance to O(n)

---

### 5. Resizing and Rehash

- Triggered when the number of elements exceeds a threshold
- All Keys re-calculate buckets
- This is the heaviest operation in Dictionary

---

### 6. Deletion Mechanism

- Uses tombstones and a freeList
- Entry is reusable but not immediately released

---

## III. List vs Dictionary Comparison

| Dimension | List | Dictionary |
|----|----|----|
| Underlying Structure | Dynamic Array | Hash Table |
| Memory Layout | Contiguous | Non-contiguous |
| Lookup | Index | Hash |
| Iteration | Very Fast | Average |
| Resizing Cost | Array Copy | Full Rehash |

---

## IV. Game Development Practice Suggestions

- Avoid Dictionary in Update / hot paths
- Pre-allocate capacity ahead of time
- Key design determines Dictionary performance
- Use arrays instead of hashes whenever possible

---

## V. Interview One-Sentence Summary

List is a dynamic array with contiguous memory, offering extremely high efficiency in access and iteration;  
Dictionary is a Key-Value structure based on a hash table, with an average lookup of O(1), but requires attention to collision and resizing costs.

---

## Conclusion

Understanding the underlying implementation of collections is the foundation for writing high-performance, controllable systems.
