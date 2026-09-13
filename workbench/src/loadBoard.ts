import type { Board } from './types'

export type BoardConfig = {
  boardUrl?: string
  boardUrlFallback?: string
  refresh?: {
    owner?: string
    repo?: string
    workflowFile?: string
    ref?: string
    dispatchToken?: string
  }
}

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function loadConfig(): Promise<BoardConfig> {
  const cfg = (await fetchJson(`${import.meta.env.BASE_URL}board-config.json`)) as BoardConfig | null
  return cfg || {}
}

export async function loadBoard(): Promise<Board> {
  try {
    const live = await fetch('/api/board')
    if (live.ok) {
      const data = await live.json()
      if (!data.error) return data as Board
    }
  } catch {
    /* continue */
  }

  const config = await loadConfig()
  const urls = [
    import.meta.env.VITE_BOARD_URL as string | undefined,
    config.boardUrl,
    config.boardUrlFallback,
  ].filter(Boolean) as string[]

  for (const remote of urls) {
    const bust = `${remote}${remote.includes('?') ? '&' : '?'}t=${Date.now()}`
    const data = (await fetchJson(bust)) as Board | null
    if (data && Array.isArray(data.goals)) return data
  }

  const snap = (await fetchJson(`${import.meta.env.BASE_URL}daily-board.json`)) as Board | null
  if (snap) return snap

  return {
    date: new Date().toISOString().slice(0, 10),
    builtAt: new Date().toISOString(),
    about: { role: 'Agent 学习者', who: '', direction: '' },
    goals: [],
    github: [],
    producthunt: [],
    error: 'no board',
    hint: '请配置 board-config.json 的 boardUrl，或运行 npm run sync',
  }
}

export function actionsRunUrl(config: BoardConfig): string | null {
  const r = config.refresh
  if (!r?.owner || !r?.repo || !r?.workflowFile) return null
  return `https://github.com/${r.owner}/${r.repo}/actions/workflows/${r.workflowFile}`
}

export async function triggerRemoteRefresh(config: BoardConfig): Promise<string> {
  const r = config.refresh
  if (!r?.owner || !r?.repo || !r?.workflowFile) {
    throw new Error('board-config 缺少 refresh 配置')
  }
  if (!r.dispatchToken) {
    throw new Error('未配置 dispatchToken：请重新执行飞书发布脚本以注入刷新令牌')
  }

  const url = `https://api.github.com/repos/${r.owner}/${r.repo}/actions/workflows/${r.workflowFile}/dispatches`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${r.dispatchToken}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ref: r.ref || 'main' }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`触发 GitHub Actions 失败 ${res.status}: ${text.slice(0, 200)}`)
  }
  return `已触发工作流 ${r.workflowFile}`
}

export async function waitForBoardUpdate(prevBuiltAt: string | undefined, timeoutMs = 180000): Promise<Board> {
  const start = Date.now()
  let last: Board | null = null
  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 5000))
    last = await loadBoard()
    if (last.builtAt && last.builtAt !== prevBuiltAt) return last
  }
  if (last) return last
  throw new Error('等待看板更新超时，请稍后下拉刷新页面')
}
