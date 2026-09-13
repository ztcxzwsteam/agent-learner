# Agent 学习求职工作台

面向学习 AI Agent、准备实习/求职的每日驾驶舱。

仓库：https://github.com/ztcxzwsteam/agent-learner

## 手机打开（已部署飞书）

https://jcnlhhon02ge.feishuapp.com/app/app_17e16q5ddk3

电脑关机也可访问。每日自动更新配置见 [DEPLOY.md](./DEPLOY.md)。

## 本地启动

```bash
cd workbench
npm install
npm run sync    # 拉 GitHub + Product Hunt，生成今日看板
npm run dev     # http://127.0.0.1:5180
```

## 可选环境变量

- `GITHUB_TOKEN`：提高 GitHub API 配额
- `PRODUCTHUNT_TOKEN`：真实 Product Hunt 热榜；未设置时用 AI 相关精选兜底
- 或 `PRODUCTHUNT_API_KEY` + `PRODUCTHUNT_API_SECRET`
