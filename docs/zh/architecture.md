# 架构说明

逆转棋局是纯客户端单页应用。本页描述模块边界、一步棋的数据流，以及浏览器与 Stockfish 的通信方式。

## 总体形态

```text
┌──────────────────────────── 浏览器 ────────────────────────────┐
│                                                               │
│  React UI（app/page.tsx + components/*）                       │
│    ├─ 摆棋模式：PieceTray、ChessBoard、合法性校验卡              │
│    ├─ 对局/终局：洞察面板、评估卡、行棋记录                      │
│    └─ 状态：棋盘 map、phase、moves[]、redoTurns[]、reviewPly    │
│                                                               │
│  app/lib/chess-utils.ts                                       │
│    棋盘 ⇄ FEN、validatePosition、终局判定、子力计算              │
│                │                                              │
│  chess.js 实例（规则层）            app/lib/use-engine.ts      │
│    合法着法、将军/将死/和棋          new Worker(engine/)        │
│                                          │ postMessage        │
│                                  ┌───────────────▼────────┐   │
│                                  │  Stockfish 17.1 WASM   │   │
│                                  │  （Worker 内 UCI 协议） │   │
│                                  └────────────────────────┘   │
└───────────────────────────────────────────────────────────────┘
                  无运行时后端 · 应用不发起网络请求
```

## 状态模型（`app/page.tsx`）

- `phase`：`setup → playing → over` 状态机。
- `board`：简单的 `{格子: {颜色,类型}}` map——编辑阶段的唯一事实源；对局开始后镜像 chess.js 实例。
- `chessRef`：chess.js 的活动 `Chess` 对象，承载权威历史与规则判定。
- `startingPositionRef`：开局快照（棋盘 + 行棋方 + 是否标准开局），支撑"重摆开局"、回看重建与易位权决策。
- `moves`、`redoTurns`、`reviewPly`：线性历史、按整回合入栈的撤销栈，以及可空的回看游标。
- 状态栏文本是派生状态；语言切换时重新推导，避免残留旧语言的文案。

## 规则层（`app/lib/chess-utils.ts`）

- `boardToFen(board, turn, castling)` 把编辑器棋盘序列化为 FEN。自定义摆法传 `-`；标准预设传 `KQkq`；半回合/回合计数固定为 `0 1`。
- `validatePosition` 实现开赛前五项检查（各一王、两王不相邻、兵的位置、双方同时被将军、未行棋方被将军），返回翻译键而非文案。
- `describeEnding` 把 chess.js 判定映射为面向用户的终局描述。
- 子力价值：兵 1 / 象 3 / 马 3 / 车 5 / 后 9。

## 引擎集成（`app/lib/use-engine.ts`）

- 全页面生命周期只创建一个 `Worker('/engine/stockfish.js')`。频繁变化的回调一律经 ref 读取；此前随语言/阵营变化重建 Worker 会打断 WASM 编译导致卡在载入中（v0.1.0 已修复）。
- 握手流程：发 `uci` → 收到 `uciok` 后设 Hash=32 → 发 `isready` → 收到 `readyok` 标记就绪。
- 每个引擎回合的搜索请求：`stop` → `position fen <fen>` → `go movetime <毫秒>`，毫秒来自滑块（400–3000）。
- 收到 `bestmove` 时：
  - `(none)` → 以"无着法"结果上抛。
  - 若搜索起始局面已变化（`activeSearchFenRef`），该应答按*过期*处理、仅保留其评分——这正是思考中悔棋也能安全工作的原因。
  - 否则以 `moved` 上抛 UCI 着法，由调用方经 `chess.move(...)` 落子（升变默认后）。
- `score cp|mate n` 行被持续捕获进待定评分，在接受的最佳着法落地时刷新为白方视角的评估展示；胜算使用 logistic 曲线（`100 / (1 + e^(−cp/240))`，夹取到 1–99%），杀棋分直接映射约 99/1。

## 渲染组件

- `chess-board.tsx` 渲染 8×8 网格（翻转时行列倒序），每个格子带 aria-label，负责选中/合法落点/最近一步高亮，支持点按和 HTML5 拖拽（自定义 MIME：`application/chess-piece` 与 `application/board-square`）。
- `piece-tray.tsx` 维护各方数量上限与放回棋子库流程。
- `position-dashboard.tsx` 渲染两份实例（面板内与棋盘下方两种形态），由 CSS 决定当前断点/阶段显示哪一个。

## 构建路径

两条构建路径共享同一份应用代码：

1. **vinext/Vite 流水线**（`npm run dev`、`npm run build`，测试所用）：输出面向 workerd 类运行时的 RSC 风格服务端产物 `dist/server/index.js`；渲染测试会直接导入它。
2. **静态导出**（`npm run build:pages`）：`next.config.ts` 切换为 `output: "export"`，并应用 `NEXT_PUBLIC_BASE_PATH` 作为 `basePath`/`assetPrefix`，产出纯静态 `out/` 交由 GitHub Pages 伺服。

生产环境没有任何服务端组件：GitHub Pages 只伺服文件，其余一切发生在访问者的浏览器里。
