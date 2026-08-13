---
title: Ascend C 算子开发入门：从 Host 到 Device 的数据通路
date: 2026-07-20
category: 异构计算
tags: [Ascend, CANN, 算子开发, NPU]
series: 昇腾AscendC算子开发实战
summary: 以一次完整的 Add 算子开发为例，梳理 Ascend C 中 Host 侧算子原型、Tiling、Device 侧 Kernel 实现三件套之间的关系。
draft: false
---

## 背景

在昇腾 Ascend 平台上开发自定义算子，通常会通过 CANN 提供的 Ascend C 语言来描述 Kernel。一个完整的算子工程通常包含三部分：**Host 侧的算子原型注册**、**Tiling 数据切分策略**、**Device 侧 Kernel 实现**。本文以最经典的 `Add` 算子为例，串起这条数据通路。

> 本文假设你已经在 NPU 云开发环境（如 hidevlab）中配置好 `ascendtoolkit`，并能正常调用 `msopgen` 工具。

## 工程结构

`msopgen` 生成的工程目录大致如下：

```
add/
├── op_host/            # Host 侧：原型 + Tiling
│   ├── add.cpp
│   └── add_tiling.cpp
├── op_kernel/          # Device 侧：Kernel 实现
│   └── add.cpp
└── CMakeLists.txt
```

## Host 侧：算子原型与 Tiling

Host 侧的核心职责是：声明输入输出类型、根据输入 shape 决定如何把数据切分到 Device 侧。

```cpp
// op_host/add.cpp
#include "register/op_def_registry.h"

namespace ops {
REG_OP(Add)
    .INPUT(x, TensorType({DT_FLOAT16, DT_FLOAT}))
    .INPUT(y, TensorType({DT_FLOAT16, DT_FLOAT}))
    .OUTPUT(z, TensorType({DT_FLOAT16, DT_FLOAT}))
    .OP_END();
}  // namespace ops
```

Tiling 决定了 Device 一次处理多少数据。最简单的策略是：当总元素数不超过一次能搬入 Unified Buffer 的上限时，单核单次处理完。

```cpp
// op_host/add_tiling.cpp
namespace optiling {
constexpr uint32_t BUFFER_NUM = 2;   // double buffer

ge::graphStatus TilingFunc(gert::TilingContext* context) {
    AddTilingData tiling;
    const uint64_t total = context->GetInputShape(0)->GetOriginShape().GetShapeSize();
    const uint32_t ubLimit = 8 * 1024;        // 示意：8KB 可用 UB
    const uint32_t tileSize = std::min(total, ubLimit / sizeof(float));

    tiling.set_tileNum((total + tileSize - 1) / tileSize);
    tiling.set_tileLength(tileSize);
    tiling.SaveToBuffer(context->GetRawTilingData()->GetData(),
                        context->GetRawTilingData()->GetCapacity());
    context->GetRawTilingData()->SetDataSize(tiling.GetDataSize());
    return ge::GRAPH_SUCCESS;
}
}  // namespace optiling
```

## Device 侧：Kernel 实现

Kernel 通过 `CopyIn` → `Compute` → `CopyOut` 三段式流水来完成一次 tile 的处理。Ascend C 把这些步骤封装在 `Process` 中，由模板自动展开。

```cpp
// op_kernel/add.cpp
#include "kernel_operator.h"

using namespace AscendC;

constexpr int32_t BUFFER_NUM = 2;

template <typename T>
class KernelAdd {
public:
    __aicore__ inline KernelAdd() {}
    __aicore__ inline void Init(GM_ADDR x, GM_ADDR y, GM_ADDR z,
                                uint32_t totalLength, uint32_t tileNum) {
        ASSERT(GetBlockNum() != 0 && "block dim can not be zero!");
        this->blockLength = totalLength / GetBlockNum();
        this->tileNum = tileNum;
        this->tileLength = this->blockLength / tileNum / BUFFER_NUM;

        xGm.SetGlobalBuffer((__gm__ T*)x + this->blockLength * GetBlockIdx(),
                            this->blockLength);
        yGm.SetGlobalBuffer((__gm__ T*)y + this->blockLength * GetBlockIdx(),
                            this->blockLength);
        zGm.SetGlobalBuffer((__gm__ T*)z + this->blockLength * GetBlockIdx(),
                            this->blockLength);
        pipe.InitBuffer(inQueueX, BUFFER_NUM, this->tileLength * sizeof(T));
        pipe.InitBuffer(inQueueY, BUFFER_NUM, this->tileLength * sizeof(T));
        pipe.InitBuffer(outQueueZ, BUFFER_NUM, this->tileLength * sizeof(T));
    }
    __aicore__ inline void Process() {
        int32_t loopCount = this->tileNum * BUFFER_NUM;
        for (int32_t i = 0; i < loopCount; i++) {
            CopyIn(i);
            Compute(i);
            CopyOut(i);
        }
    }

private:
    __aicore__ inline void CopyIn(int32_t progress) {
        LocalTensor<T> xLocal = inQueueX.AllocTensor<T>();
        LocalTensor<T> yLocal = inQueueY.AllocTensor<T>();
        DataCopy(xLocal, xGm[progress * this->tileLength], this->tileLength);
        DataCopy(yLocal, yGm[progress * this->tileLength], this->tileLength);
        inQueueX.EnQue(xLocal);
        inQueueY.EnQue(yLocal);
    }
    __aicore__ inline void Compute(int32_t progress) {
        LocalTensor<T> xLocal = inQueueX.DeQue<T>();
        LocalTensor<T> yLocal = inQueueY.DeQue<T>();
        LocalTensor<T> zLocal = outQueueZ.AllocTensor<T>();
        Add(zLocal, xLocal, yLocal, this->tileLength);
        outQueueZ.EnQue<T>(zLocal);
        inQueueX.FreeTensor(xLocal);
        inQueueY.FreeTensor(yLocal);
    }
    __aicore__ inline void CopyOut(int32_t progress) {
        LocalTensor<T> zLocal = outQueueZ.DeQue<T>();
        DataCopy(zGm[progress * this->tileLength], zLocal, this->tileLength);
        outQueueZ.FreeTensor(zLocal);
    }

private:
    TPipe pipe;
    TQue<QuePosition::VECIN, BUFFER_NUM> inQueueX, inQueueY;
    TQue<QuePosition::VECOUT, BUFFER_NUM> outQueueZ;
    GlobalTensor<T> xGm, yGm, zGm;
    uint32_t blockLength = 0;
    uint32_t tileNum = 0;
    uint32_t tileLength = 0;
};

extern "C" __global__ __aicore__ void add(__gm__ uint8_t* x, __gm__ uint8_t* y,
                                          __gm__ uint8_t* z, __gm__ uint8_t* tiling) {
    KernelAdd<half> op;
    uint32_t totalLength = *((__gm__ uint32_t*)tiling);
    uint32_t tileNum = *((__gm__ uint32_t*)tiling + 1);
    op.Init(x, y, z, totalLength, tileNum);
    op.Process();
}
```

## 调试小技巧

- 用 `printf` 不行——Kernel 里要用 `GLOABLE_COMPILE_FLAG` 打开的 `DumpTensor`。
- Tiling 算错最容易导致越界，建议在 `Init` 里加 `ASSERT`。
- 用 `msprof` 抓一次 trace，可以看到 `CopyIn/Compute/CopyOut` 三级流水是否真正重叠。

## 小结

Ascend C 算子开发的关键，是建立"Host 切分 → Device 流水"的心智模型。把 Tiling 当作 Host 与 Device 之间的契约，Kernel 实现才有明确的边界。后续文章会展开 Vector 与 Cube 两种计算路径的差异。
