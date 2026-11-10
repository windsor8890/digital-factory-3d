# DF-01 数字工厂 · Digital Factory Twin

[简体中文](README.md) · [English](README.en.md)

单文件、离线可开的 3D 数字工厂数字孪生：剖切式新能源汽车总装车间 + 实时数据层 + 工业 HUD + 电影级自动巡游。

**▶ 打开 [`digital-factory-3d.html`](digital-factory-3d.html)** 双击即可（Chrome / Edge，无需联网）。

## 亮点

- **完整工艺链**：原材料立库 → 冲压 → 焊装 → 涂装 → 总装 → 检测发运（Z01–Z06）；
  含立体库/堆垛机、4 台压机、8 个焊接机器人单元、涂装房/烘房、双总装线、EOL 光廊与发运月台。
- **实时数字孪生**：21 个工位、58 s 节拍、OEE / 产量 / WIP / 能耗 / 告警；
  分区轮廓、投影标签、能源与物料流、工位状态信标。
- **电影级巡游**：9 段连续长镜头，约 88 秒无缝循环，覆盖全部环节；
  `?film=1` 进入纯净录屏模式（隐藏 HUD + 2.39:1 遮幅）。
- **单文件离线**：three.js r160 内联，模型 / 纹理 / 图表全程序化，零外部请求；桌面 60 fps。

## 操作

- 拖拽旋转 · 滚轮缩放 · 点击地面分区或设备巡检
- 键盘：`1–6` 分区、`0` 总览、`D` 数据层、`L` 标签、`Space` 巡游、`B` 遮幅、`F` 全屏、`Esc` 退出
- 录屏：`?film=1`；带 HUD 巡游：`?tour=1`；定格检查：`?tourat=25`

## 构建

```powershell
node build-df.js
```

`src-df/` 分片合并并内联 three.js，输出 `digital-factory-3d.html`；
`qa-df/` 提供 Playwright 截图、控制台捕获与交互回归脚本。

## 验证

- 交互回归 **29/29**，巡游章节覆盖 **9/9**，控制台零错误、零外部请求
- 远景背景帧间差 ≈ 0（静态亮度遮罩颗粒）
- 参考指标：271 draw calls / 291k triangles / 21 stations

## 文档

- 制作规格：[`src-df/CONTRACT.md`](src-df/CONTRACT.md)
- 可复现提示词：[`PROMPT-数字工厂.md`](PROMPT-数字工厂.md)

> 数据为示意（DEMO TELEMETRY）。
