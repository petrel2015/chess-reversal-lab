# 逆转棋局（Chess Reversal）

[English](./README.md) | 简体中文

[![Deploy GitHub Pages](https://github.com/petrel2015/chess-reversal-lab/actions/workflows/pages.yml/badge.svg)](https://github.com/petrel2015/chess-reversal-lab/actions/workflows/pages.yml)
![Version](https://img.shields.io/badge/version-0.1.0-blue)
![Node](https://img.shields.io/badge/node-%E2%89%A522.13-brightgreen)
![Next.js](https://img.shields.io/badge/Next.js-16-black)
![React](https://img.shields.io/badge/React-19-blue)
![Engine](https://img.shields.io/badge/engine-Stockfish%2017.1%20WASM-green)

一个完全在浏览器本地运行的国际象棋残局实验器：自由摆放棋子，指定你希望获胜的一方，然后与本地运行的 Stockfish 17.1 把这个局面走完。

常规国际象棋网站很难直接回答"如果我现在少一个后但攻势很盛会怎样"这类问题。逆转棋局把自定义摆棋作为第一操作：从空棋盘开始摆放标准棋子，选择希望获胜的一方与先手方，AI 会为指定一方寻找最佳路线，你来模拟另一方。

> AI 助手 / Agent：如需结构化理解、介绍、使用或汇报本项目，请阅读英文版 [README_FOR_AI.md](./README_FOR_AI.md)。

## 在线体验

**[立即使用 →](https://petrel2015.github.io/chess-reversal-lab/)**

无需安装、无需注册、无服务器交互。规则判定、引擎搜索、页面渲染全部在浏览器本地完成。

![加载标准开局后的摆棋界面](docs/img/overview-zh.webp)

## 为什么做这个项目

现有对弈类应用都以"继续一盘棋"为中心，很难凭空构造一个"假如"时刻：

- 想练习优势残局："多一车，我真的能赢下来吗？"
- 想测试劣势防守："面对最强应对，我能不能顶住？"
- 想研究某个经典子力配置，却不想到处找 FEN、再跟复杂的编辑器搏斗。

逆转棋局把"摆一个局面"变成主流程：从按颜色分组的棋子库里点选或拖拽棋子，应用实时校验合法性。随后选择希望获胜的一方——Stockfish 控制这一方并始终走出它认为最好的棋，你负责模拟另一方。

项目名字里藏着一句实话：引擎不会伪造奇迹。如果指定的一方在理论上已经败势，评估会如实告诉你。

## 核心功能

### 自定义残局摆设

可以从空棋盘搭建任意合法局面，也可以一键载入标准开局。棋子通过点按或拖拽放置、移动；双方各自从带数量上限的棋子库取子。合法性实时校验：双方各恰好一个王、两王不相邻、兵不在第一/第八排、不出现不可能的将军状态。

![正在摆放一个白方后单杀黑王的残局](docs/img/custom-endgame-setup-zh.webp)

[使用指南](./docs/zh/usage.md#摆一个自定义残局) · [功能设计](./docs/zh/features/custom-position-setup.md)

### 引擎驱动对局

Stockfish 17.1（单线程 WASM 版）以 Web Worker 方式紧邻页面运行，控制你指定的获胜方并始终走出最佳着法。"AI 思考时间"滑块（0.4–3.0 秒）可在速度与深度之间权衡。

[使用指南](./docs/zh/usage.md#开始推演) · [功能设计](./docs/zh/features/engine-driven-play.md)

### 悔棋、恢复与非破坏式回看

悔棋会撤销完整的一个回合（你的着法加上引擎的应手），恢复则原样重放——若恢复后轮到引擎，它会重新计算应答而不是假装记得。另有独立的回看模式，可以逐半步浏览全局而不影响正在进行的对局。

[使用指南](./docs/zh/usage.md#改变棋局走向) · [功能设计](./docs/zh/features/move-history-controls.md)

### 局面洞察面板

实时面板显示双方子力差和一条胜算估计条，且估计来源透明可辨：摆棋阶段按子力估算、对局中采用 Stockfish 评估、终局给出精确结果、回看时跟随所查看的半步。

![对局中的评估卡与行棋记录](docs/img/match-analysis-zh.webp)

[使用指南](./docs/zh/usage.md#读懂局面面板) · [功能设计](./docs/zh/features/position-insights.md)

### AI 教练讲棋

顶栏打开 AI 教练抽屉，用自然语言追问"为什么这么走"。在网页内配置你自己的 OpenAI 兼容服务（Base URL / API Key / 模型名，仅保存在本浏览器、直连服务商），提问时自动携带当前查看局面的完整上下文：FEN、着法记录、最后一手是谁走的、Stockfish 评估与复盘位置。支持快捷提问与可选的"引擎每走一步自动简评"（默认关闭）。

### 中英双语界面

简体中文 / English 双语界面，自动探测浏览器语言，手动切换会被记住。棋盘本身使用与语言无关的代数记谱。

[使用指南](./docs/zh/usage.md#切换语言) · [功能设计](./docs/zh/features/internationalization.md)

## 快速开始

需要 Node.js `>= 22.13.0`。包管理器使用 npm（仓库含 `package-lock.json`）。

```bash
git clone https://github.com/petrel2015/chess-reversal-lab.git
cd chess-reversal-lab
npm install
npm run dev
```

打开 <http://localhost:3000/>。

其他常用命令：

```bash
npm test              # 生产构建 + 10 个集成测试（node --test）
npm run lint          # ESLint（存在既有报错，见下文已知问题）
npm run build:pages   # 静态导出 GitHub Pages 构建到 out/
```

开发细节见[开发指南](./docs/zh/development.md)。

## 基本用法

1. **摆棋** —— 直接使用标准开局，或点击"空棋盘 / 标准开局"预设后从棋子库摆放。
2. **配置** —— 选择希望获胜的一方与先手方，调整 AI 思考时间。
3. **开始推演** —— 校验通过后，引擎锁定你所选的一方。
4. **行棋** —— 点击己方棋子再点击高亮格落子，引擎自动应手。
5. **调整** —— 随时悔棋/恢复、进入回看模式逐半步复盘，或回到摆棋模式（沿用原开局或以当前局面为新起点）。

完整操作说明（含边界行为）见[使用指南](./docs/zh/usage.md)；常见问题见[FAQ](./docs/zh/faq.md)。

## 技术栈

- [Next.js](https://nextjs.org/) 16（App Router）+ React 19 + TypeScript
- Tailwind CSS v4
- [chess.js](https://github.com/jhlywa/chess.js) —— 合法着法、将军/将死/和棋判定
- [Stockfish 17.1](https://stockfishchess.org/) —— 单线程 WASM 构建，位于 `public/engine/`，在 Web Worker 中以 UCI 协议驱动
- 静态导出（`out/`）部署到 GitHub Pages

## 架构概要

应用是纯客户端单页应用。`app/page.tsx` 维护游戏状态机（setup → playing → over）；`app/lib/chess-utils.ts` 负责棋盘/FEN 转换与局面校验；`app/lib/use-engine.ts` 持有一个页面级生命周期的 Web Worker，以 UCI 协议驱动 Stockfish WASM，并把 `bestmove`、评估值与过期搜索防护回传给 React。运行时没有后端。

模块关系与数据流详见[架构说明](./docs/zh/architecture.md)。

## 文档

| 文档 | 内容 |
| --- | --- |
| [使用指南](./docs/zh/usage.md) | 分步操作、输入规则、边界行为 |
| [开发指南](./docs/zh/development.md) | 环境要求、命令、目录结构、素材脚本 |
| [架构说明](./docs/zh/architecture.md) | 模块划分、数据流、引擎协议处理 |
| [部署指南](./docs/zh/deployment.md) | GitHub Pages 流水线、子路径、本地验证 |
| [常见问题排查](./docs/zh/troubleshooting.md) | 引擎载入、状态卡住、构建失败 |
| [隐私说明](./docs/zh/privacy.md) | 哪些数据留在浏览器、哪些从不外发 |
| [FAQ](./docs/zh/faq.md) | 关于范围与行为的常见问题 |
| [功能索引](./docs/zh/features/index.md) | 主要功能的设计文档 |

English docs: [Documentation index](./docs/en/index.md)

## 兼容性

需要支持 WebAssembly 与 Web Worker 的现代桌面或移动浏览器（所有常青浏览器均满足）。界面响应式适配至小屏手机宽度，支持添加到 iPhone 主屏幕。未包含 Service Worker，离线可用性不做承诺。

![窄屏手机上的移动端布局](docs/img/mobile-layout-zh.webp)

## 更新日志

见 [CHANGELOG.zh.md](./CHANGELOG.zh.md)。英文版见 [CHANGELOG.md](./CHANGELOG.md)。

## 参与贡献

这是个人项目，暂无正式的贡献流程。欢迎通过 [Issues](https://github.com/petrel2015/chess-reversal-lab/issues) 反馈问题或讨论功能。

## 许可说明

仓库尚未声明顶层开源许可证。内置于 `public/engine/` 的 Stockfish 17.1 浏览器构建遵循 GPLv3，许可证副本随附于 `public/engine/COPYING.txt`。
