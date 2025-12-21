---
title: "网络架构重构：从继承到组合 (From Inheritance to Composition)"
date: 2025-12-21T11:00:00+08:00
draft: false
tags: ["Unity", "Architecture", "Networking", "Refactoring"]
categories: ["Tech"]
summary: "深入解析为何我们放弃了继承式 NetworkMonoBehaviour，转而采用组合模式来构建更灵活、内存安全的 Unity 网络架构。"
---

## 1. 背景与问题

项目的网络层雏形是基于简单的 RPC 广播和继承式组件。随着“双世界”架构（Server Logic / Client View）的深入，原有的设计暴露出了三个主要问题：

1. **参数传输僵化**：`RpcSpawnObject` 只支持基本类型，无法灵活传递复杂的初始化数据（如队伍及内部 Squad 配置）。
2. **基类膨胀与耦合**：为了复用 `BindId` 逻辑，`ClientRoomManager` 被迫继承 `NetworkMonoBehaviour`，但这引入了不需要的 MonoBehaviour 生命周期开销，且限制了继承链。
3. **生命周期缺失**：网络对象没有统一的销毁回调，导致 Client 端在对象销毁后，RPC 监听器仍然驻留在总线中，造成内存泄漏。

## 2. 解决方案

### 2.1 协议升级：基于 Payload 的通用传输

引入泛型序列化与 Payload 结构，解耦了“生成指令”与“生成数据”。

```csharp
// 网络包定义
public struct RpcSpawnObject : IRpc
{
    public NetworkPrefabType Type;
    public uint NetId;
    public byte[] Payload; // 序列化后的二进制数据
}

// 具体的生成数据包
public struct TeamSpawnPayload
{
    public FactionType Faction;
    public long TeamId;
    public uint OwnerNetId; // 动态归属权 ID
    public List<long> SquadList;
}
```

**优势**：

* **灵活性**：新增 prefab 类型只需增加对应的 Payload struct，无需修改 RPC 定义。
* **归属权动态化**：通过 payload 传递 `OwnerNetId`，Client 端可以在运行时查找并链接任意 Owner（Player 或 AI），打破了之前“默认链接本地玩家”的硬编码限制。

### 2.2 架构解耦：组合优于继承 (Composition over Inheritance)

废弃了 `NetworkMonoBehaviour` 基类，改用组合模式。

```csharp
// 抽取 ID 逻辑到独立 Handle
public struct NetworkIdHandle
{
    private uint _netid;
    public uint NetId => _netid;
    public void BindId(uint netid) { ... }
}

// ClientRoomManager 现在的样子
public class ClientRoomManager : MonoBehaviour, IRoomManager
{
    private NetworkIdHandle _netHandle; // 组合使用
    public void BindId(uint id) => _netHandle.BindId(id);
    
    // ...
}
```

**优势**：

* **清晰的继承链**：`ClientRoomManager` 回归纯净的 `MonoBehaviour`。
* **逻辑复用**：`NetworkIdHandle` 可以被任何类（包括纯 C# 类）持有，复用性更强。

### 2.3 生命周期标准化

在接口层面强制约束生命周期。

```csharp
public interface INetworkBehaviour
{
    uint NetId { get; }
    
    // 初始化 (Async)
    UniTask InitAsync(); 
    
    // 逻辑帧
    void Tick(int tick);
    
    // 销毁清理 (必须实现)
    UniTask ShutdownAsync();
}
```

**优势**：

* **防止泄漏**：`ClientRoomManager.OnDestroyObject` 统一调用 `ShutdownAsync`，确保 RPC 监听器被注销。
* **统一调度**：Bus 层可以统一管理所有网络对象的 Tick 更新。

## 3. 总结

这次重构不仅是代码层面的清理，更是架构思想的转变。通过消除不必要的继承，我们让每个组件的职责更加单一；通过标准化的生命周期，我们保证了系统的健壮性。这为后续更复杂的技能系统（NP_Tree）接入打下了坚实基础。
