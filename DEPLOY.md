# 手机访问与每日自动更新

## 飞书链接（电脑关机也能开）

https://jcnlhhon02ge.feishuapp.com/app/app_17e16q5ddk3

## 架构说明

飞书妙搭只托管**界面**（静态网页），不能在云端每天自己跑 Node 脚本。

因此每日更新拆成两步：

1. **定时任务（GitHub Actions）**每天自动：拉 GitHub API + Product Hunt → 生成 `workbench/public/daily-board.json` 并推送到仓库  
2. **手机上的飞书应用**每次打开时，去拉这个公开的 JSON（见 `board-config.json` 的 `boardUrl`）

这样：**不用开电脑**，数据也会每天更新。

## 你需要完成的一次性配置

### 1. 把本项目推到 GitHub（建议 Public）

在 GitHub 新建空仓库，例如 `agent-learner`，然后：

```bash
cd D:\工作台\agent-learner
git init -b main
git add -A
git commit -m "feat: agent learner workbench"
git remote add origin https://github.com/<你的用户名>/agent-learner.git
git push -u origin main
```

### 2. 填写看板地址并重新发布飞书

编辑 `workbench/public/board-config.json`：

```json
{
  "boardUrl": "https://cdn.jsdelivr.net/gh/<你的用户名>/agent-learner@main/workbench/public/daily-board.json"
}
```

然后本地执行：

```bash
cd workbench
npm run build
lark-cli apps +html-publish --app-id app_17e16q5ddk3 --path ./dist
```

（把链接发给我，我也可以帮你改配置并重新发布。）

### 3. （可选）Product Hunt 真实热榜

在 GitHub 仓库 Settings → Secrets 增加：

- `PRODUCTHUNT_TOKEN`：Product Hunt API token  
- 可选 `GH_FETCH_TOKEN`：更高 GitHub API 配额（没有则用内置 `GITHUB_TOKEN`）

Actions 工作流：`.github/workflows/daily-sync.yml`（每天 UTC 00:00 ≈ 北京时间 8:00，也可手动 Run workflow）

## 当前状态

- 飞书应用：**已发布、已公开**
- 今日数据：已打进安装包（可先用）
- 自动每日更新：等你提供 GitHub 仓库地址并写入 `boardUrl` 后生效
