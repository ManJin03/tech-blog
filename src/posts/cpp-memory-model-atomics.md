---
title: C++ 内存模型：从原子操作到 happens-before 关系
date: 2026-07-12
category: 系统编程
tags: [C++, 并发, 内存模型, atomic]
series:
  name: 现代C++内存与并发
  order: 2
summary: 理解 std::atomic 的六种内存序，关键不在于背 API，而在于建立 happens-before 与同步关系的心智模型。
draft: false
---

## 为什么需要内存模型

在没有内存模型的世界里，编译器重排、CPU 乱序执行会让多线程程序的行为变得不可预测。C++11 引入的内存模型，本质上是程序员与编译器/CPU 之间的一份契约：**在哪些点上，哪些操作可见性必须被保证**。

## 六种内存序

```cpp
#include <atomic>
#include <thread>
#include <iostream>

std::atomic<int> data{0};
std::atomic<bool> ready{false};

void producer() {
    data.store(42, std::memory_order_relaxed);    // (1)
    ready.store(true, std::memory_order_release); // (2)
}

void consumer() {
    while (!ready.load(std::memory_order_acquire)) // (3)
        ;
    std::cout << data.load(std::memory_order_relaxed) << "\n"; // (4) 一定看到 42
}

int main() {
    std::thread t1(producer);
    std::thread t2(consumer);
    t1.join(); t2.join();
}
```

上面这个例子是 acquire-release 配对的最经典场景。理解它的关键不是记 API，而是看懂下面这张关系图。

| 内存序 | 语义 | 典型用途 |
|---|---|---|
| `relaxed` | 只保证原子，不保证顺序 | 计数器、统计 |
| `consume` | acquire 的数据依赖版本（实际退化为 acquire） | 极少使用 |
| `acquire` | load 之后的读写不能重排到 load 前 | 读锁、接收同步 |
| `release` | store 之前的读写不能重排到 store 后 | 写锁、发布数据 |
| `acq_rel` | 同时具备 acquire 与 release | RMW 操作（如 exchange） |
| `seq_cst` | 全局总顺序，最强保证 | 默认值，性能最低 |

## happens-before 是核心

内存模型的所有结论，都可以归约到 **happens-before** 这一个关系上。它的传递性构成了线程间的同步链：

1. 同一线程内：程序顺序 `A; B;` ⇒ `A happens-before B`（sequenced-before）。
2. 跨线程：若 release-store 被 acquire-load 观察到，则 store 之前的所有操作 happens-before load 之后的所有操作。
3. 传递性：`A happens-before B` 且 `B happens-before C` ⇒ `A happens-before C`。

回到上面的例子：`(1) sequenced-before (2)`，`(2) 同步于 (3)`（因为 (3) 读到了 (2) 写入的 true），`(3) sequenced-before (4)`。由传递性：`(1) happens-before (4)`，所以 (4) 一定读到 42。

## 一个常见的反例：用 relaxed 做同步

```cpp
std::atomic<int> flag{0};

// 线程 A
data = 42;                                   // 普通写
flag.store(1, std::memory_order_relaxed);    // ❌ 不能保证 data 对线程 B 可见

// 线程 B
if (flag.load(std::memory_order_relaxed)) {  // ❌ 即使读到 1，也不保证看到 data=42
    use(data);
}
```

`relaxed` 只保证 `flag` 自身的原子性，不会建立任何跨线程的 happens-before 关系。编译器/CPU 完全可能把 `data = 42` 重排到 `flag.store` 之后，于是线程 B 看到了 flag=1 却读到 data 的旧值。

## seq_cst 的代价

`seq_cst`（顺序一致）是最强保证，它要求所有 seq_cst 操作存在一个全局总顺序，所有线程都看到同一个顺序。代价是性能：在 x86 上 store 需要插入 `mfence` 或用 `xchg`，在 ARM 上需要 `dmb ish`。

```cpp
// 默认是 seq_cst
std::atomic<int> x{0};
x.store(1);   // 等价于 x.store(1, std::memory_order_seq_cst);
```

经验法则：**先用 seq_cst 保证正确，再用 profiler 找到热点降级为 acq_rel**。不要一开始就追求极致性能而用 relaxed，那是 bug 的温床。

## 小结

- 记住 happens-before 的三条规则，比背六种内存序更有用。
- acquire/release 是性价比最高的同步原语，覆盖 90% 的场景。
- relaxed 只用于"我不关心顺序，只关心原子性"的场景，如自增计数。
