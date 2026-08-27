# 开发指南

本文覆盖本地运行、测试与构建所需的全部内容。环境要求：macOS/Linux/Windows，**Node.js >= 22.13.0**，包管理器为 npm（仓库提交了 `package-lock.json`，可复现安装请用 `npm ci`）。

## 命令

| 命令 | 作用 |
| --- | --- |
| `npm install` / `npm ci` | 安装依赖 |
| `npm run dev` | 开发服务器，地址 <http://localhost:3000/>（vinext + 本地 worker 运行时） |
| `npm test` | 先执行生产构建，再用 `node --test tests/*.test.mjs` 跑 10 个集成测试 |
| `npm run lint` | 对仓库运行 ESLint（存在既有报错，见下文） |
| `npm run build` | vinext 生产构建（Cloudflare 风格服务端产物输出到 `dist/`，供渲染测试使用） |
| `npm run build:pages` | 为 GitHub Pages 静态导出到 `out/`（`GITHUB_PAGES=true next build --webpack`） |

没有独立的类型检查脚本；TypeScript 检查在构建过程中完成。

### 测试

`npm test` 先做完整构建（构建失败会第一时间暴露），然后执行：

- `tests/chess-rules.test.mjs` —— 基于 chess.js 的纯规则检查：兵的方向、标准预设完整性（32 子 + 易位权）、子力差计算、整回合悔棋语义、回看重建语义。
- `tests/rendered-html.test.mjs` —— 导入构建产物（`dist/server/index.js`），渲染页面壳并断言：PWA 元数据、引擎资源、棋子图片、i18n 词典、源码关键集成点、CSS 布局规则（含移动端触控目标最小尺寸）以及 Pages 工作流配置。

截至 v0.1.0 文档编写时：**10/10 全部通过**。

### Lint 现状

`npm run lint` 目前报告的均为既有问题，与文档工作无关：

- 内联的第三方压缩文件 `public/engine/stockfish.js` 中有 8 个报错（外部构建产物，非项目代码）
- `app/` 源码在严格规则下约 38 个报错

这些保持原样记录；改代码后再跑一次即可看出是否新增问题。

## 目录结构

```text
app/
  layout.tsx            # 根布局：I18nProvider、PWA 元数据
  page.tsx              # 游戏状态机与全部界面（客户端组件）
  globals.css           # Tailwind v4 入口 + 手写样式
  components/
    chess-board.tsx     # 棋盘网格渲染、选中与合法落点高亮
    piece-tray.tsx      # 双方棋子库：数量上限、点按/拖拽交互
    position-dashboard.tsx  # 子力明细、子力差、胜算条
    piece-art.tsx       # 棋子图片组件
    language-toggle.tsx # 中/EN 切换
    donate-button.tsx   # 支付宝/微信捐赠弹窗
  lib/
    chess-utils.ts      # FEN 转换、合法性校验、终局判定、子力计算
    use-engine.ts       # Stockfish 的 Web Worker 生命周期 + UCI 处理
    i18n.tsx            # zh/en 词典、语言探测、translate()
public/
  chess-pieces/         # 12 张透明棋子贴纸（w-/b- × k q r b n p）
  engine/               # stockfish.js + stockfish.wasm + GPLv3 COPYING.txt
  donate/               # alipay-qr.png、wechat-qr.png
build/sites-vite-plugin.ts  # vinext 开发/构建路径使用的 Vite 插件
worker/index.ts         # 非 Pages 运行时的 Cloudflare Workers 入口
db/、drizzle/、examples/d1/  # 初始模板遗留物，应用未使用
scripts/                # 素材工具脚本（见下）
tests/                  # 上文所述的 node --test 测试套件
.github/workflows/pages.yml # 推送 main 时部署 Pages
```

## 素材脚本

辅助脚本用于重新生成已提交的素材，只在需要改动素材时运行：

- `python3 scripts/slice_piece_sheet.py` —— 把原始棋子图切分为归一化的透明 PNG 到 `public/chess-pieces/`
- `node scripts/generate-app-icons.mjs` —— 生成 icon-192/512 与 apple-touch-icon
- `node scripts/generate-donate-qr.mjs` —— 重新生成捐赠二维码
- `node scripts/compress-images.mjs` —— 重新压缩仓库图片

## 本地开发说明

- `npm run dev` 走 vinext/Vite 流水线（同一份 RSC 应用代码），而非静态导出；应用行为本身一致。
- 引擎必须能通过 `/engine/stockfish.js`（及 `.wasm`）访问。开发模式与 Pages 构建都会自动由 public 目录提供，自定义子路径经 `NEXT_PUBLIC_BASE_PATH` 生效。
- 应用/构建读取的环境变量：
  - `GITHUB_PAGES=true` —— 让 `next.config.ts` 切换到静态导出模式（`out/`、尾斜杠、图片不优化）
  - `NEXT_PUBLIC_BASE_PATH` —— 子路径前缀（如 `/chess-reversal-lab`）
  - `NEXT_PUBLIC_SITE_URL` —— 元数据使用的规范站点地址
- 服务端渲染默认界面语言是简体中文；挂载后客户端探测可能切换为英文。

## 本地验证 Pages 构建

用与线上一致的子路径构建并伺服 `out/`：

```bash
GITHUB_PAGES=true \
NEXT_PUBLIC_BASE_PATH=/chess-reversal-lab \
NEXT_PUBLIC_SITE_URL=https://petrel2015.github.io/chess-reversal-lab/ \
npm run build:pages
# 然后在 http://127.0.0.1:<端口>/chess-reversal-lab/ 下伺服 out/
```

不要从文件系统根目录直接伺服——导出时已固化 basePath，路径会断。CI 流水线细节见[部署指南](./deployment.md)。
