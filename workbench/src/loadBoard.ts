import type { Board } from './types'

type BoardConfig = {
  boardUrl?: string
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

export async function loadBoard(): Promise<Board> {
  // 1) 本地开发 API
  try {
    const live = await fetch('/api/board')
    if (live.ok) {
      const data = await live.json()
      if (!data.error) return data as Board
    }
  } catch {
    /* continue */
  }

  // 2) 运行时配置的远程看板（GitHub Actions 每日更新）
  const config = (await fetchJson(`${import.meta.env.BASE_URL}board-config.json`)) as BoardConfig | null
  const remote = (import.meta.env.VITE_BOARD_URL as string | undefined) || config?.boardUrl
  if (remote) {
    const bust = `${remote}${remote.includes('?') ? '&' : '?'}t=${Date.now()}`
    const data = (await fetchJson(bust)) as Board | null
    if (data && Array.isArray(data.goals)) return data
  }

  // 3) 发布包内快照（兜底）
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
