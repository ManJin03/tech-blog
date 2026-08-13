---
title: 现代 C++ 智能指针：所有权思维的三种姿态
date: 2026-06-28
category: 系统编程
tags: [C++, 智能指针, RAII, 内存管理]
summary: unique_ptr、shared_ptr、weak_ptr 不是三选一的开关，而是表达所有权语义的三种语言。选对指针，等于把资源生命周期的契约写进类型。
draft: false
---

## 所有权是问题，智能指针是答案

裸指针的问题不在于"会泄漏"，而在于**它不表达意图**。看到 `Foo* p`，你无法知道：调用者是否负责释放？是否允许为 null？是否独占？智能指针的价值，是用类型把这些问题回答清楚。

## unique_ptr：独占所有权

```cpp
#include <memory>
#include <vector>

class Widget {
public:
    Widget() = default;
    void doWork();
};

// 工厂函数：把所有权移交出去
std::unique_ptr<Widget> makeWidget() {
    return std::make_unique<Widget>();   // C++14 起推荐写法
}

void useWidget() {
    auto w = makeWidget();               // 独占，离开作用域自动析构
    w->doWork();

    // std::unique_ptr<Widget> w2 = w;   // ❌ 编译期拒绝拷贝
    std::unique_ptr<Widget> w2 = std::move(w);  // ✓ 显式转移所有权
    // 此后 w == nullptr
}
```

`unique_ptr` 是零开销抽象——在 Release 下与裸指针内存布局一致。它是**默认选择**：当你不确定该用哪个时，先用 `unique_ptr`。

### 自定义删除器

```cpp
// 管理 C API 资源：FILE*、句柄、NPU buffer 等
struct FileDeleter {
    void operator()(FILE* f) const {
        if (f) std::fclose(f);
    }
};
using UniqueFile = std::unique_ptr<FILE, FileDeleter>;

UniqueFile openFile(const char* path) {
    return UniqueFile(std::fopen(path, "r"));
}
```

> 注意：自定义删除器会作为 `unique_ptr` 类型的一部分，影响类型签名。功能型删除器（如 `fclose`）建议用仿函数而非 lambda，避免每个 lambda 都生成不同类型。

## shared_ptr：共享所有权

`shared_ptr` 用引用计数实现共享。当最后一个 `shared_ptr` 被销毁时，对象才析构。

```cpp
#include <memory>
#include <iostream>

class Node : public std::enable_shared_from_this<Node> {
public:
    std::shared_ptr<Node> next;
    std::weak_ptr<Node> prev;          // ⚠️ 必须用 weak_ptr，否则循环引用

    std::shared_ptr<Node> getSelf() {
        return shared_from_this();      // 安全地获取指向自己的 shared_ptr
    }
};

int main() {
    auto a = std::make_shared<Node>();
    auto b = std::make_shared<Node>();
    a->next = b;
    b->prev = a;                         // weak_ptr，不增加引用计数
    // a, b 离开作用域后能正常析构
}
```

### 循环引用是 shared_ptr 的死穴

如果把上面 `prev` 也改成 `shared_ptr`，`a` 和 `b` 互相持有，引用计数永远 ≥ 1，永远不会析构。这是内存泄漏的高发区。

> 经验：**双向引用的一端必须用 `weak_ptr`**。父持子用 `shared_ptr`，子回指父用 `weak_ptr`。

### 控制块的代价

`shared_ptr` 内部维护一个控制块，包含 strong count、weak count、删除器、分配器。这意味着：

- 拷贝 `shared_ptr` 是原子操作（默认 `seq_cst`），有性能开销。
- `make_shared` 把对象和控制块分配在同一块内存，减少一次 malloc，但内存要等 weak count 也归零才释放——大对象 + 长期持有的 weak_ptr 会导致内存延迟释放。

## weak_ptr：不拥有的观察者

`weak_ptr` 不增加引用计数，使用前必须 `lock()` 提升为 `shared_ptr`：

```cpp
std::weak_ptr<Widget> weak;

void observer() {
    if (auto sp = weak.lock()) {        // 原子地检查并提升
        sp->doWork();                   // 对象仍然存活
    } else {
        std::cout << "对象已销毁\n";
    }
}
```

典型场景：

1. **缓存**：缓存持有 `weak_ptr`，对象没人用时自动失效。
2. **观察者模式**：被观察对象不持有观察者生命期。
3. **打破循环引用**：见上节。

## 选择决策表

| 场景 | 选择 | 理由 |
|---|---|---|
| 独占资源，单一所有者 | `unique_ptr` | 零开销，意图最清晰 |
| 跨线程共享，生命期不确定 | `shared_ptr` | 引用计数自动管理 |
| 观察别人持有的对象 | `weak_ptr` | 不延长生命期 |
| 只读共享，运行期不变 | `shared_ptr<const T>` | const 表达不可变契约 |
| 数组 | `unique_ptr<T[]>` | 或直接用 `std::vector` |

## 小结

智能指针的本质不是"自动 delete"，而是**用类型表达所有权契约**。选对指针，资源生命期就从注释里的口头约定变成了编译器强制的类型契约。默认 `unique_ptr`，确需共享才 `shared_ptr`，观察用 `weak_ptr`——这三句话覆盖 95% 的场景。
