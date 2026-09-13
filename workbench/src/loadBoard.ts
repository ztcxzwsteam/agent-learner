import type { Board, SearchResults } from './types'

export type BoardConfig = {
  boardUrl?: string
  boardUrlFallback?: string
  dshUrl?: string
  dshEndpointUrl?: string
  dshEndpointUrlFallback?: string
  search?: {
    defaultQuery?: string
    githubToken?: string
  }
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

export async function loadSearchResults(): Promise<SearchResults | null> {
  try {
    const live = await fetch('/api/search-results')
    if (live.ok) {
      const data = await live.json()
      if (data && Array.isArray(data.items)) return data as SearchResults
    }
  } catch {
    /* continue */
  }
  const snap = (await fetchJson(`${import.meta.env.BASE_URL}github-search.json`)) as SearchResults | null
  if (snap && Array.isArray(snap.items)) return snap
  return null
}

export async function pingDsh(): Promise<boolean> {
  try {
    const res = await fetch('/api/dsh-ping')
    if (!res.ok) return false
    const data = await res.json()
    return Boolean(data?.ok)
  } catch {
    return false
  }
}

export async function startDsh(): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await fetch('/api/dsh-start', { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    return { ok: Boolean(data?.ok ?? res.ok), message: data?.message || data?.error }
  } catch (e) {
    return { ok: false, message: String(e) }
  }
}

/** 本机开发态可内嵌；飞书静态站无法代理本机 DSH */
export function canEmbedDshLocally(): boolean {
  if (typeof window === 'undefined') return false
  const h = window.location.hostname
  return import.meta.env.DEV || h === 'localhost' || h === '127.0.0.1'
}

export const DSH_EMBED_SRC = '/dsh-embed/'

export async function loadDshEndpoint(config?: BoardConfig): Promise<string | null> {
  const cfg = config || (await loadConfig())
  if (cfg.dshUrl?.trim()) return cfg.dshUrl.replace(/\/?$/, '/')

  const urls = [cfg.dshEndpointUrl, cfg.dshEndpointUrlFallback].filter(Boolean) as string[]
  // 本地 public 快照
  urls.push(`${import.meta.env.BASE_URL}dsh-endpoint.json`)

  for (const u of urls) {
    const bust = `${u}${u.includes('?') ? '&' : '?'}t=${Date.now()}`
    const data = (await fetchJson(bust)) as { url?: string } | null
    if (data?.url?.trim()) return data.url.replace(/\/?$/, '/')
  }
  return null
}

export function resolveDshFrameSrc(
  config: BoardConfig,
  localUp: boolean,
  remoteUrl?: string | null,
): string | null {
  if (remoteUrl?.trim()) return remoteUrl.replace(/\/?$/, '/')
  if (config.dshUrl?.trim()) return config.dshUrl.replace(/\/?$/, '/')
  if (canEmbedDshLocally() && localUp) return DSH_EMBED_SRC
  return null
}
