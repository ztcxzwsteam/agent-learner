import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')
const OUT_DIR = path.join(ROOT, '23 explore', 'github')

const SEED_REPOS = [
  'anthropics/anthropic-sdk-typescript',
  'modelcontextprotocol/servers',
  'langchain-ai/langchain',
  'langchain-ai/langgraph',
  'microsoft/autogen',
  'crewAIInc/crewAI',
  'browser-use/browser-use',
  'openai/openai-agents-python',
  'openclaw/openclaw',
  'vercel/ai',
]

const QUERY = 'ai agent OR mcp OR llm-agent stars:>200'

function today() {
  return new Date().toISOString().slice(0, 10)
}

function headers() {
  const h = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'agent-learner-workbench',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  return h
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: headers() })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${res.status} ${url}: ${text.slice(0, 200)}`)
  }
  return res.json()
}

function mapRepo(r, reason) {
  return {
    id: r.full_name,
    name: r.name,
    fullName: r.full_name,
    url: r.html_url,
    description: r.description || '（无描述）',
    stars: r.stargazers_count,
    language: r.language,
    topics: r.topics || [],
    updatedAt: r.pushed_at,
    reason,
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const date = today()
  const items = []
  const errors = []

  try {
    const search = await fetchJson(
      `https://api.github.com/search/repositories?q=${encodeURIComponent(QUERY)}&sort=stars&order=desc&per_page=8`,
    )
    for (const r of search.items || []) {
      items.push(mapRepo(r, 'GitHub 搜索：高星 Agent / MCP / LLM Agent 相关'))
    }
  } catch (e) {
    errors.push(String(e))
  }

  for (const full of SEED_REPOS.slice(0, 6)) {
    if (items.some((x) => x.fullName.toLowerCase() === full.toLowerCase())) continue
    try {
      const r = await fetchJson(`https://api.github.com/repos/${full}`)
      items.push(mapRepo(r, '种子清单：Agent 学习必看方向'))
    } catch (e) {
      errors.push(`${full}: ${e}`)
    }
  }

  // de-dupe, keep top 5 by stars but prefer diversity
  const seen = new Set()
  const unique = []
  for (const it of items.sort((a, b) => b.stars - a.stars)) {
    if (seen.has(it.fullName)) continue
    seen.add(it.fullName)
    unique.push(it)
    if (unique.length >= 5) break
  }

  const payload = {
    date,
    source: 'github',
    syncedAt: new Date().toISOString(),
    auth: Boolean(process.env.GITHUB_TOKEN),
    items: unique,
    errors,
  }

  const jsonPath = path.join(OUT_DIR, `${date}.json`)
  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), 'utf-8')

  const md = [
    `# GitHub 探索 · ${date}`,
    '',
    ...unique.map(
      (r, i) =>
        `## ${i + 1}. [${r.fullName}](${r.url})\n- ⭐ ${r.stars} · ${r.language || 'n/a'}\n- ${r.description}\n- 为何看：${r.reason}\n`,
    ),
  ].join('\n')
  fs.writeFileSync(path.join(OUT_DIR, `${date}.md`), md, 'utf-8')

  console.log(`github: wrote ${unique.length} repos -> ${jsonPath}`)
  if (errors.length) console.warn('warnings:', errors.join('\n'))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
