/**
 * 发布飞书前注入 GitHub workflow_dispatch token（不写入 git 仓库源文件）。
 * 优先读 GITHUB_DISPATCH_TOKEN / GH_TOKEN 环境变量。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')
const DIST_CONFIG = path.join(ROOT, 'workbench', 'dist', 'board-config.json')
const SRC_CONFIG = path.join(ROOT, 'workbench', 'public', 'board-config.json')

function loadEnv() {
  const p = path.join(ROOT, '.env')
  if (!fs.existsSync(p)) return
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#') || !t.includes('=')) continue
    const i = t.indexOf('=')
    const k = t.slice(0, i).trim()
    const v = t.slice(i + 1).trim()
    if (!process.env[k]) process.env[k] = v
  }
}

function tokenFromGitCredential() {
  const input = 'protocol=https\nhost=github.com\n\n'
  const r = spawnSync('git', ['credential', 'fill'], {
    input,
    encoding: 'utf8',
    windowsHide: true,
  })
  if (r.status !== 0) return null
  const m = r.stdout.match(/^password=(.+)$/m)
  return m?.[1]?.trim() || null
}

loadEnv()
let token =
  process.env.GITHUB_DISPATCH_TOKEN ||
  process.env.GH_TOKEN ||
  process.env.GITHUB_TOKEN ||
  tokenFromGitCredential()

if (!token) {
  console.warn('prepare-publish: 未找到 dispatch token，飞书端手动刷新将不可用（仍可打开看板）。')
}

const base = JSON.parse(fs.readFileSync(SRC_CONFIG, 'utf8'))
if (!fs.existsSync(path.dirname(DIST_CONFIG))) {
  console.error('prepare-publish: 请先 npm run build 生成 dist')
  process.exit(1)
}

const out = {
  ...base,
  refresh: {
    ...(base.refresh || {}),
    ...(token ? { dispatchToken: token } : {}),
  },
}
fs.writeFileSync(DIST_CONFIG, JSON.stringify(out, null, 2))
console.log(
  token
    ? 'prepare-publish: 已向 dist/board-config.json 注入 dispatchToken'
    : 'prepare-publish: dist/board-config.json 未注入 token',
)
