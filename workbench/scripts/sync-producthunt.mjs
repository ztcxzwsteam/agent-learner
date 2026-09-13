import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')
const OUT_DIR = path.join(ROOT, '23 explore', 'producthunt')

function today() {
  return new Date().toISOString().slice(0, 10)
}

function loadEnvFiles() {
  for (const p of [path.join(ROOT, '.env'), path.join(ROOT, 'workbench', '.env')]) {
    if (!fs.existsSync(p)) continue
    for (const line of fs.readFileSync(p, 'utf-8').split(/\r?\n/)) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const i = t.indexOf('=')
      if (i <= 0) continue
      const key = t.slice(0, i).trim()
      let val = t.slice(i + 1).trim()
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1)
      }
      if (process.env[key] == null || process.env[key] === '') process.env[key] = val
    }
  }
}

/** Fallback when API unavailable */
const FALLBACK = [
  {
    name: 'Cursor',
    tagline: 'AI-first code editor / agentic coding',
    url: 'https://www.producthunt.com/products/cursor',
    votes: null,
    topics: ['Developer Tools', 'AI'],
    insight: '观察 IDE Agent 如何把工具调用、规则与工作区结合起来，对求职演示很有价值。',
  },
  {
    name: 'Claude',
    tagline: 'AI assistant with projects, artifacts, and computer use',
    url: 'https://www.producthunt.com/products/claude',
    votes: null,
    topics: ['AI', 'Productivity'],
    insight: '关注 Skills / MCP / Projects 如何沉淀成可复用工作流。',
  },
  {
    name: 'v0',
    tagline: 'AI UI generation by Vercel',
    url: 'https://www.producthunt.com/products/v0',
    votes: null,
    topics: ['Design Tools', 'AI'],
    insight: '看「生成 UI → 迭代」闭环，适合作为 Agent 产品交互案例。',
  },
  {
    name: 'Perplexity',
    tagline: 'AI answer engine',
    url: 'https://www.producthunt.com/products/perplexity-ai',
    votes: null,
    topics: ['AI', 'Search'],
    insight: '检索增强与引用来源展示，是讲清 RAG 产品化的好例子。',
  },
  {
    name: 'Bolt',
    tagline: 'AI full-stack app builder',
    url: 'https://www.producthunt.com/products/bolt-new',
    votes: null,
    topics: ['Developer Tools', 'AI'],
    insight: '从提示词到可运行应用，适合分析 Agent 编排与沙箱执行。',
  },
  {
    name: 'Windsurf',
    tagline: 'Agentic IDE',
    url: 'https://www.producthunt.com/products/windsurf-editor',
    votes: null,
    topics: ['Developer Tools', 'AI'],
    insight: '对比不同 Agent IDE 的权限、上下文与协作方式。',
  },
]

async function getAccessToken() {
  if (process.env.PRODUCTHUNT_TOKEN) return process.env.PRODUCTHUNT_TOKEN

  const clientId = process.env.PRODUCTHUNT_API_KEY
  const clientSecret = process.env.PRODUCTHUNT_API_SECRET
  if (!clientId || !clientSecret) return null

  // Product Hunt 官方示例使用 x-www-form-urlencoded
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
  })
  const res = await fetch('https://api.producthunt.com/v2/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(
      `oauth token ${res.status}: ${JSON.stringify(data).slice(0, 300)}。若持续失败，请在 Product Hunt 应用页点击 Create Token，把 Developer Token 写入 PRODUCTHUNT_TOKEN。`,
    )
  }
  if (!data.access_token) throw new Error('oauth response missing access_token')
  return data.access_token
}

async function fetchFromApi(token) {
  const query = `
    query {
      posts(first: 20) {
        edges {
          node {
            name
            tagline
            url
            votesCount
            createdAt
            topics {
              edges { node { name } }
            }
          }
        }
      }
    }
  `
  const res = await fetch('https://api.producthunt.com/v2/api/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    body: JSON.stringify({ query }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Product Hunt API ${res.status}: ${JSON.stringify(data).slice(0, 300)}`)
  if (data.errors?.length) throw new Error(JSON.stringify(data.errors))
  const edges = data.data?.posts?.edges || []
  return edges.map(({ node }) => {
    const topics = (node.topics?.edges || []).map((e) => e.node.name)
    const aiRelated = topics.some((t) => /ai|agent|developer|productivity|saas|llm/i.test(t)) ||
      /ai|agent|llm|gpt|claude|cursor/i.test(`${node.name} ${node.tagline}`)
    return {
      name: node.name,
      tagline: node.tagline,
      url: node.url,
      votes: node.votesCount,
      createdAt: node.createdAt,
      topics,
      insight: aiRelated
        ? '与 AI/开发者工具相关，评估它解决的工作流是否可用 Agent 复现。'
        : '观察定位与增长点，思考能否用 Agent 做同类助手。',
      aiRelated,
    }
  })
}

async function main() {
  loadEnvFiles()
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const date = today()
  let items = []
  let mode = 'fallback'
  const errors = []

  try {
    const token = await getAccessToken()
    if (!token) {
      items = FALLBACK
      errors.push(
        '未设置 PRODUCTHUNT_TOKEN，也未设置 PRODUCTHUNT_API_KEY/SECRET。使用精选兜底。',
      )
    } else {
      const all = await fetchFromApi(token)
      const preferred = all.filter((x) => x.aiRelated)
      items = (preferred.length >= 3 ? preferred : all).slice(0, 8)
      mode = 'api'
    }
  } catch (e) {
    errors.push(String(e))
    items = FALLBACK
    mode = 'fallback'
  }

  const payload = {
    date,
    source: 'producthunt',
    mode,
    syncedAt: new Date().toISOString(),
    items,
    errors,
  }

  const jsonPath = path.join(OUT_DIR, `${date}.json`)
  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), 'utf-8')

  const md = [
    `# Product Hunt · ${date} (${mode})`,
    '',
    ...items.map(
      (p, i) =>
        `## ${i + 1}. [${p.name}](${p.url})\n- ${p.tagline}\n- 票数：${p.votes ?? 'n/a'} · ${(p.topics || []).join(', ')}\n- 启发：${p.insight}\n`,
    ),
  ].join('\n')
  fs.writeFileSync(path.join(OUT_DIR, `${date}.md`), md, 'utf-8')

  console.log(`producthunt: wrote ${items.length} items (${mode}) -> ${jsonPath}`)
  if (errors.length) console.warn(errors.join('\n'))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
