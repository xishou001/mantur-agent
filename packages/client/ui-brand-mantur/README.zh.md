---
description: "爱映工厂 在侧边栏与空会话首页中的 Logo 和产品文案占位者，供组装漫途桌面客户端的维护者使用。"
kind: "package-reference"
---

# `@deepseek-ai/dsh-client-ui-brand-mantur`

[English](README.md) | 中文

## 概述

本包在通用侧边栏和空会话首页显示Aiying 字标和圆角应用图标、本地化的 `爱映工厂` 产品名称与漫途产品承诺。收起的侧边栏显示同一 Logo，悬停时再显示普通面板按钮；空的 hero badge 占位者则使漫途组装不显示 Web 预览版徽标。它不改变布局、对话、模型、权限或 Agent 能力。

## 目录

- [使用本包](#use-this-package)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)
- [开发记录](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

只通过 [`dsh-mantur-app`](../../bundle/mantur-app/README.zh.md) 组装本条目。浏览器端在所有者声明后注册 `sidebar.brand.mark`、`sidebar.brand.name`、`conversation.hero.brand.mark`、`conversation.hero.headline` 与 `conversation.hero.badge`。中英文 locale 都在侧边栏显示已确认的产品名称 `爱映工厂`，首页则在“故事起于一念，余下交给爱映工厂”或其英文等价文案前显示已确认的 Logo。漫途 Web 应用必须在构建页面旁提供 `aiying-icon.png` 与 `aiying-wordmark.svg`。字标的两处无障碍名称均由 locale 字典提供，中英文都保留图样名称 `Aiying Works`。

<a id="model-experience"></a>
## 模型体验

无，因为本包只贡献浏览器呈现，漫途的模型身份归 profile bundle 所有。

#### KV Cache 影响

无；本包中的文本不会进入 provider 请求。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- **原生图标仍使用位图**—应用图标沿用现有 PNG 和 ICNS 素材；字标使用无字体依赖的 SVG 轮廓曲线。
- **完整产品名仍然可见**—Logo 会补充展开侧边栏中的 `爱映工厂`，不会取代本地化名称。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文—点击展开</summary>

展开行和首页使用 SVG 字标，收起轨道使用应用图标。侧边栏 shell 负责在收起状态悬停时，把 Logo 切换为面板导航指示。

</details>

**运行时不变式：**不发布 companion。一个浏览器 effect 会成组安装和移除全部五个 slot 占位者。

展开侧边栏时，透明底 Aiying Works 字标位于“爱映工厂”文字旁；收起后保留圆角方形应用图标。首页使用同一透明字标。透明 SVG 包含字母轮廓和节点图案，完整适配保留所有曲线，不裁剪或拉伸。
