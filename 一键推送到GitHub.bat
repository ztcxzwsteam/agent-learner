@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo === 1) 请先在浏览器打开并创建公开仓库 ===
echo https://github.com/new?name=agent-learner^&visibility=public
echo 仓库名必须是: agent-learner
echo Owner 选: ztcxzwsteam
echo 不要勾选 README / .gitignore / license（保持空仓库）
echo.
pause

where gh >nul 2>&1
if %errorlevel%==0 (
  echo === 尝试用 gh 登录并创建仓库 ===
  gh auth login -h github.com -p https -w
  gh repo create ztcxzwsteam/agent-learner --public --source=. --remote=origin --push
  if %errorlevel%==0 goto done
)

echo === 使用 git 推送（需你已在网页建好空仓库）===
git remote remove origin 2>nul
git remote add origin https://github.com/ztcxzwsteam/agent-learner.git
git branch -M main
git push -u origin main
if %errorlevel% neq 0 (
  echo.
  echo 推送失败：请安装 GitHub Desktop 登录后重试，或把 Personal Access Token 当作密码使用。
  pause
  exit /b 1
)

:done
echo.
echo 推送成功！请到 Actions 打开 Daily board sync，可手动 Run workflow 测一次。
echo 飞书地址: https://jcnlhhon02ge.feishuapp.com/app/app_17e16q5ddk3
pause
