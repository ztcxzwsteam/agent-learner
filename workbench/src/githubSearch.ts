import type { RepoItem, SearchResults } from './types'
import { loadConfig, type BoardConfig } from './loadBoard'

const DEFAULT_QUERY = 'ai agent OR mcp OR llm-agent OR tool-calling stars:>100'

function whyNow(fullName: string, description: string, topics: string[]) {
  const blob = `${fullName} ${description} ${topics.join(' ')}`.toLowerCase()
  if (/mcp/.test(blob)) return 'MCP / 工具协议相关，适合对照 harness 与工具调用。'
  if (/langgraph|autogen|crewai|swarm/.test(blob)) return '主流 Agent 编排框架，适合读架构差异。'
  if (/browser|playwright|computer.?use/.test(blob)) return '浏览器 / Computer Use 方向。'
  if (/rag|retrieval/.test(blob)) return '检索增强相关，和记忆/知识入口有关。'
  return '与 Agent / LLM 应用相关，可评估是否值得精读 README。'
}

export async function searchAgentRepos(opts: {
  query?: string
  limit?: number
  token?: string
}): Promise<SearchResults> {
  const query = (opts.query || DEFAULT_QUERY).trim() || DEFAULT_QUERY
  const limit = Math.min(15, Math.max(1, opts.limit ?? 8))
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${limit}`
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`

  const res = await fetch(url, { headers })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`GitHub 搜索失败 ${res.status}: ${JSON.stringify(data).slice(0, 180)}`)
  }

  const items: RepoItem[] = (data.items || []).map(
    (r: {
      full_name: string
      name: string
      html_url: string
      description: string | null
      stargazers_count: number
      language: string | null
      topics?: string[]
      pushed_at?: string
    }) => ({
      id: r.full_name,
      name: r.name,
      fullName: r.full_name,
      url: r.html_url,
      description: r.description || '（无描述）',
      stars: r.stargazers_count,
      language: r.language,
      topics: r.topics || [],
      reason: whyNow(r.full_name, r.description || '', r.topics || []),
    }),
  )

  return {
    date: new Date().toISOString().slice(0, 10),
    query,
    syncedAt: new Date().toISOString(),
    source: 'workbench-feishu-search',
    items,
  }
}

export async function resolveSearchToken(config?: BoardConfig): Promise<string | undefined> {
  const cfg = config || (await loadConfig())
  return cfg.search?.githubToken || cfg.refresh?.dispatchToken || undefined
}

export { DEFAULT_QUERY }
