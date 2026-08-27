# 部署指南

站点通过 [.github/workflows/pages.yml](https://github.com/petrel2015/chess-reversal-lab/blob/main/.github/workflows/pages.yml) 在每次推送 `main` 时自动部署到 **GitHub Pages**，全程约 1–2 分钟。工作流也支持手动触发（`workflow_dispatch`）。

## 流水线步骤

1. 检出代码 → Node 22（带 npm 缓存）。
2. `npm ci --ignore-scripts`。
3. `actions/configure-pages`（如管理员尚未启用 Pages，也会尝试启用）。
4. 静态导出：
   ```bash
   GITHUB_PAGES=true \
   NEXT_PUBLIC_BASE_PATH=/chess-reversal-lab \
   NEXT_PUBLIC_SITE_URL=https://<owner>.github.io/chess-reversal-lab/ \
   npm run build:pages
   ```
5. `touch out/.nojekyll`，让 GitHub 原样伺服带 `_/` 前缀的 Next.js 资源。
6. 通过 `actions/upload-pages-artifact` 上传、`actions/deploy-pages` 部署 `out/` 产物。

并发组为 `pages`，新的推送会取消尚未完成的旧部署。

## 子路径处理

Pages 在 `/chess-reversal-lab/` 下伺服站点，因此路径在构建期固化：

- `NEXT_PUBLIC_BASE_PATH` 同时成为 `next.config.ts` 的 `basePath` 与 `assetPrefix`，影响 HTML、JS、CSS、图片、`site.webmanifest`，以及代码中拼接的引擎地址（`${basePath}/engine/stockfish.js`）。
- `trailingSlash: true` 与 Pages 式目录 URL（`/chess-reversal-lab/foo/`）匹配。
- 导出模式下图片不做优化。
- 除 `/` 外没有客户端路由；404 页由 Next.js 导出生成，其余深路径不存在。

## 自定义域名

当前未配置。若之后要接入：

1. 在构建与上传之间给产物加一个 `CNAME` 文件（需扩展工作流）。
2. 同步更新 `NEXT_PUBLIC_SITE_URL`。
3. 配置 DNS 与仓库的 Pages 设置。

## 首次启用

如果 Action 报告 *"Pages not enabled"*：进入仓库 Settings → Pages，把 Source 设为 *GitHub Actions* 一次即可，之后的推送无需干预（`configure-pages` 在具备权限时也会自动尝试启用）。

## 发布验证

推送后：

1. 在 Actions 页观察 *Deploy GitHub Pages* 工作流运行。
2. 打开 <https://petrel2015.github.io/chess-reversal-lab/>（强制刷新绕过缓存）。
3. 确认顶栏状态胶囊到达"Stockfish 17.1 已就绪"——这证明 WASM 资源在子路径下可访问。
4. 与引擎走一步棋作为冒烟测试。

本地预验证步骤见[开发指南](./development.md#本地验证-pages-构建)。
