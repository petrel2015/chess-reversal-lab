# 逆转棋局

一个在浏览器本地运行的自定义国际象棋残局实验器。用户从空棋盘开始摆放标准棋子，选择希望获胜的一方与下一手行棋方，然后由 Stockfish 17.1 控制指定方，用户模拟另一方。

## 运行

需要 Node.js `>=22.13.0`。

```bash
npm install
npm run dev
```

发布前验证：

```bash
npm test
```

GitHub Pages 静态构建：

```bash
NEXT_PUBLIC_BASE_PATH=/chess-reversal-lab \
NEXT_PUBLIC_SITE_URL=https://YOUR_ACCOUNT.github.io/chess-reversal-lab/ \
npm run build:pages
```

仓库包含 `.github/workflows/pages.yml`。推送到 `main` 后会自动构建 `out/`
并通过 GitHub Pages 发布。

## 设计边界

- 所有局面都使用 FEN 传给 Stockfish，浏览器内通过 Web Worker 运行轻量单线程 WASM 引擎。
- `chess.js` 负责合法棋步、将军、将死与和棋判断。
- 自定义局面不携带历史信息，因此第一版固定禁用王车易位和吃过路兵。
- 对局中的兵升变默认升后。
- 引擎只能从给定局面寻找最佳着法，不能保证理论败势逆转。
- 页面不接入在线国际象棋平台，也不会代替用户在第三方对局中落子。
- 棋子使用 `public/chess-pieces/` 内的透明贴纸图片；生成源图使用
  `scripts/slice_piece_sheet.py` 进行可重复裁切和尺寸归一化。

## 常见诊断

- 页面一直显示“引擎载入中”：确认 `/engine/stockfish.js` 与 `/engine/stockfish.wasm` 能被静态访问。
- 无法开始：查看右侧结构化局面校验提示；双方必须各有一个王，王不能相邻，兵不能在第一或第八排。
- AI 不落子：确认当前轮到 AI 所控制的颜色，并查看顶部引擎状态。
- 修改依赖后运行 `npm test`，它会重新构建并验证页面壳、引擎资源与关键集成点。

## 许可

Stockfish 17.1 浏览器构建位于 `public/engine/`，遵循 GPLv3；许可证副本见 `public/engine/COPYING.txt`。
