---
title: 异步编程演进：从回调地狱到协程的百年孤独
date: 2026-06-10
category: 编程范式
tags: [异步, Promise, async/await, 协程, JavaScript]
summary: 异步编程的每一次演进，都是在解决上一代的可读性债。回调嵌套→Promise 链→async/await→协程，本质都是把"等待"从控制流里赶出去。
draft: false
---

## 异步为什么难

异步的核心矛盾：**CPU 想顺序思考，IO 却天然并行**。一旦遇到 IO 等待，线程要么阻塞（浪费），要么挂起后续逻辑（割裂控制流）。每一种异步范式，都是在尝试弥合这两者的裂缝。

## 第一代：回调（Callback）

```javascript
// Node.js 风格：错误优先回调
const fs = require('fs');

function readConfig(path, callback) {
    fs.readFile(path, 'utf8', (err, data) => {
        if (err) return callback(err);
        const config = JSON.parse(data);
        fs.readFile(config.dbPath, 'utf8', (err, dbData) => {
            if (err) return callback(err);
            const db = JSON.parse(dbData);
            fs.readFile(db.schemaPath, 'utf8', (err, schema) => {
                if (err) return callback(err);
                callback(null, JSON.parse(schema));
            });
        });
    });
}

readConfig('./config.json', (err, schema) => {
    if (err) console.error('失败:', err);
    else console.log('schema:', schema);
});
```

问题显而易见：

1. **回调地狱**：嵌套随依赖深度线性增长。
2. **错误处理分散**：每层都要 `if (err)`。
3. **控制流不可读**：无法用 try/catch、for/while 描述流程。

## 第二代：Promise / Future

Promise 把"未来的值"变成一等公民，用链式调用替代嵌套：

```javascript
const fs = require('fs').promises;

function readConfig(path) {
    return fs.readFile(path, 'utf8')
        .then(data => JSON.parse(data))
        .then(config => fs.readFile(config.dbPath, 'utf8'))
        .then(dbData => JSON.parse(dbData))
        .then(db => fs.readFile(db.schemaPath, 'utf8'))
        .then(schema => JSON.parse(schema));
}

readConfig('./config.json')
    .then(schema => console.log('schema:', schema))
    .catch(err => console.error('失败:', err));   // 错误集中处理
```

进步：

- 扁平化了嵌套。
- 错误能沿链冒泡，一处 catch 兜底。
- Promise 状态不可逆，避免了回调被多次触发。

但 `then` 链仍然是"数据流描述"，不是"控制流描述"——循环、条件、异常依然别扭。

## 第三代：async/await

`async/await` 是 Promise 的语法糖，但让异步代码长得像同步代码：

```javascript
async function readConfig(path) {
    try {
        const config = JSON.parse(await fs.readFile(path, 'utf8'));
        const db = JSON.parse(await fs.readFile(config.dbPath, 'utf8'));
        const schema = JSON.parse(await fs.readFile(db.schemaPath, 'utf8'));
        return schema;
    } catch (err) {
        console.error('失败:', err);
        throw err;
    }
}

// 并发：Promise.all + await
async function readBoth(a, b) {
    const [x, y] = await Promise.all([readConfig(a), readConfig(b)]);
    return { x, y };
}
```

关键点：

- `await` 只能在 `async` 函数内（顶层 await 是 ES2022 扩展）。
- `await` 暂停的是函数，不是线程——事件循环继续跑。
- 错误用 `try/catch`，终于回归传统控制流。

## 第四代：协程（Coroutine）

`async/await` 本质就是协程的一种特化。更通用的协程能表达更丰富的控制流，比如生成器、状态机、协作式调度。C++20 协程长这样：

```cpp
#include <coroutine>
#include <iostream>

struct Awaitable {
    bool await_ready() noexcept { return false; }
    void await_suspend(std::coroutine_handle<> h) noexcept {
        // 可以把 h 存起来，稍后 resume；这里立即恢复
        h.resume();
    }
    void await_resume() noexcept {}
};

struct Task {
    struct promise_type {
        Task get_return_object() { return {}; }
        std::suspend_never initial_suspend() noexcept { return {}; }
        std::suspend_never final_suspend() noexcept { return {}; }
        void return_void() {}
        void unhandled_exception() {}
    };
};

Task demo() {
    std::cout << "step 1\n";
    co_await Awaitable{};        // 挂起点：可让出执行权
    std::cout << "step 2\n";
    co_await Awaitable{};
    std::cout << "step 3\n";
}

int main() {
    demo();                       // 输出 step 1/2/3
}
```

协程的精髓在 `co_await`：它把"等待"变成一个**可被运行时调度的挂起点**。与线程切换相比，协程切换在用户态完成，没有内核陷入开销。

## 四代演进的本质

| 范式 | 控制流表达 | 错误处理 | 并发组合 |
|---|---|---|---|
| 回调 | 嵌套闭包 | 分散 | 困难 |
| Promise | 链式 `then` | 集中 catch | `Promise.all` |
| async/await | 同步风格 | try/catch | `await Promise.all` |
| 协程 | `co_await` 挂起点 | 异常 | 调度器组合 |

每一代都在做同一件事：**把"等待"从控制流里赶出去，但把"结果"留在控制流里**。回调把等待藏进闭包，Promise 把等待包装成值，async/await 把等待变成语法，协程把等待变成可调度对象。

## 小结

理解异步演进的关键，不是记 API，而是看清每一代解决的是上一代的什么痛点。下次面对一个新的异步运行时（Rust async、Go goroutine、Python asyncio），先问三个问题：它的挂起点是什么？错误怎么传播？多个并发怎么组合？答案往往就在这四代演进里。
