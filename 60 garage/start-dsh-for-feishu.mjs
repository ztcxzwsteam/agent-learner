/**
 * 为本机 DSH 开公网隧道，供飞书工作台 iframe 使用。
 * 流程：启动 DSH → 去框代理(3081) → cloudflared → 写入 dsh-endpoint.json → 尽量推到 GitHub
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, spawnSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const ENDPOINT = path.join(ROOT, 'workbench', 'public', 'dsh-endpoint.json')
const DSH_PORT = 3080
const PROXY_PORT = 3081

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function isUp(port) {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 1200)
    const r = await fetch(`http://127.0.0.1:${port}/`, { signal: ctrl.signal })
    clearTimeout(t)
    return r.ok || r.status < 500
  } catch {
    return false
  }
}

function startDetached(command, args, cwd) {
  const child = spawn(command, args, {
    cwd,
    env: process.env,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    shell: process.platform === 'win32',
  })
  child.unref()
  return child
}

async function ensureDsh() {
  if (await isUp(DSH_PORT)) {
    console.log('DSH 已在 3080 运行')
    return
  }
  console.log('启动 DeepSeek Harness…')
  startDetached(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['--yes', '@deepseek-ai/dsh', 'web'],
    ROOT,
  )
  for (let i = 0; i < 40; i++) {
    await sleep(2000)
    if (await isUp(DSH_PORT)) {
      console.log('DSH 已就绪')
      return
    }
    process.stdout.write('.')
  }
  throw new Error('DSH 启动超时，请手动运行：npx @deepseek-ai/dsh web')
}

async function ensureProxy() {
  if (await isUp(PROXY_PORT)) {
    console.log('去框代理已在 3081 运行')
    return
  }
  console.log('启动去框代理 3081…')
  startDetached(process.execPath, [path.join(__dirname, 'dsh-frame-proxy.mjs')], ROOT)
  for (let i = 0; i < 20; i++) {
    await sleep(500)
    if (await isUp(PROXY_PORT)) {
      console.log('代理已就绪')
      return
    }
  }
  throw new Error('代理启动失败')
}

function findCloudflared() {
  const r = spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', ['cloudflared'], {
    encoding: 'utf8',
  })
  const line = (r.stdout || '').split(/\r?\n/).map((s) => s.trim()).find(Boolean)
  return line || null
}

function startTunnel() {
  const bin = findCloudflared()
  if (!bin) {
    throw new Error('未找到 cloudflared。请先安装：winget install Cloudflare.cloudflared')
  }
  console.log('启动 Cloudflare 隧道…')
  return new Promise((resolve, reject) => {
    const child = spawn(bin, ['tunnel', '--url', `http://127.0.0.1:${PROXY_PORT}`], {
      cwd: ROOT,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let settled = false
    const onData = (buf) => {
      const text = buf.toString()
      process.stdout.write(text)
      const m = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i)
      if (m && !settled) {
        settled = true
        resolve({ url: m[0], child })
      }
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.on('exit', (code) => {
      if (!settled) reject(new Error(`cloudflared 退出 code=${code}`))
    })
    setTimeout(() => {
      if (!settled) reject(new Error('等待隧道 URL 超时'))
    }, 90000)
  })
}

function writeEndpoint(publicUrl) {
  const payload = {
    url: publicUrl.replace(/\/?$/, '/'),
    updatedAt: new Date().toISOString(),
    note: '由 start-dsh-for-feishu 生成；电脑关机或脚本结束后飞书将无法连接。',
  }
  fs.mkdirSync(path.dirname(ENDPOINT), { recursive: true })
  fs.writeFileSync(ENDPOINT, JSON.stringify(payload, null, 2), 'utf8')
  console.log(`已写入 ${ENDPOINT}`)
  return payload
}

function tryPushEndpoint() {
  const status = spawnSync('git', ['status', '--porcelain', 'workbench/public/dsh-endpoint.json'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  if (!status.stdout?.trim()) {
    console.log('endpoint 无变更，跳过推送')
    return
  }
  spawnSync('git', ['add', 'workbench/public/dsh-endpoint.json'], { cwd: ROOT, stdio: 'inherit' })
  const commit = spawnSync(
    'git',
    ['commit', '-m', 'chore: update dsh endpoint for Feishu embed'],
    { cwd: ROOT, encoding: 'utf8' },
  )
  if (commit.status !== 0) {
    console.warn('提交失败（可能无变更或需手动提交）：', commit.stderr || commit.stdout)
    return
  }
  const push = spawnSync('git', ['push', 'origin', 'HEAD'], { cwd: ROOT, stdio: 'inherit' })
  if (push.status !== 0) {
    console.warn('推送失败：请手动 git push，否则飞书读不到新地址')
  } else {
    console.log('已推送到 GitHub，飞书约 10–30 秒后可刷新使用')
  }
}

async function main() {
  console.log('=== DSH for 飞书工作台 ===')
  console.log('仓库根目录:', ROOT)
  await ensureDsh()
  await ensureProxy()
  const { url, child } = await startTunnel()
  writeEndpoint(url)
  tryPushEndpoint()
  console.log('')
  console.log('公网地址:', url)
  console.log('请打开飞书学习台 → 搜索 → DSH 对话（强制刷新）')
  console.log('保持本窗口运行；关闭后飞书将断开。')
  console.log('')
  child.on('exit', (code) => {
    console.log('隧道已结束', code)
    process.exit(code || 0)
  })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
