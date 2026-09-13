# 车库

同步脚本在 `workbench/scripts/`。

## DeepSeek Harness（飞书工作台要用 Agent）

飞书是静态页，不能直接跑本机 DSH。做法是：

1. 双击 [`start-dsh-for-feishu.bat`](start-dsh-for-feishu.bat)（需已安装 cloudflared）
2. 等它打印公网地址并 `git push`
3. 打开飞书学习台 → **搜索** → **DSH Agent** → 「我已启动，刷新连接」
4. **保持 bat 窗口不要关**（关了隧道就断）

本机开发：`workbench` 里 `npm run dev`，搜索页可直接内嵌本机 DSH。
