import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')
const OUT_DIR = path.join(ROOT, '23 explore', 'producthunt')
const TOP_N = 10

function todayUTC() {
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

/** Product Hunt 日历日（美国太平洋时间） */
function phDayBounds(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZoneName: 'shortOffset',
    })
      .formatToParts(now)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, p.value]),
  )
  const day = `${parts.year}-${parts.month}-${parts.day}`
  // timeZoneName like "GMT-7" / "GMT-8"
  const off = String(parts.timeZoneName || 'GMT-7').replace('GMT', '')
  const offset = off.startsWith('+') || off.startsWith('-') ? `${off}:00`.replace(/:-/, '-0') : '-07:00'
  // Normalize "-7" -> "-07:00"
  let normalized = offset
  const m = off.match(/^([+-])(\d{1,2})$/)
  if (m) normalized = `${m[1]}${m[2].padStart(2, '0')}:00`

  const next = new Date(`${day}T12:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  const nextDay = next.toISOString().slice(0, 10)

  return {
    day,
    postedAfter: `${day}T00:00:00${normalized}`,
    postedBefore: `${nextDay}T00:00:00${normalized}`,
  }
}

const FALLBACK = [
  {
    name: 'Cursor',
    tagline: 'AI-first code editor / agentic coding',
    url: 'https://www.producthunt.com/products/cursor',
    votes: null,
    topics: ['Developer Tools', 'AI'],
    insight: '观察 IDE Agent 如何把工具调用、规则与工作区结合起来。',
    aiRelated: true,
  },
]

async function getAccessToken() {
  if (process.env.PRODUCTHUNT_TOKEN) return process.env.PRODUCTHUNT_TOKEN
  const clientId = process.env.PRODUCTHUNT_API_KEY
  const clientSecret = process.env.PRODUCTHUNT_API_SECRET
  if (!clientId || !clientSecret) return null
  const res = await fetch('https://api.producthunt.com/v2/oauth/token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Host: 'api.producthunt.com',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`oauth token ${res.status}: ${JSON.stringify(data).slice(0, 300)}`)
  if (!data.access_token) throw new Error('oauth response missing access_token')
  return data.access_token
}

async function fetchTodayTopByVotes(token, n = TOP_N) {
  const { day, postedAfter, postedBefore } = phDayBounds()
  const query = `
    query TodayTop($after: DateTime!, $before: DateTime!, $first: Int!) {
      posts(
        first: $first
        order: VOTES
        featured: true
        postedAfter: $after
        postedBefore: $before
      ) {
        edges {
          node {
            name
            tagline
            url
            votesCount
            createdAt
            featuredAt
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
    body: JSON.stringify({
      query,
      variables: { after: postedAfter, before: postedBefore, first: n },
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Product Hunt API ${res.status}: ${JSON.stringify(data).slice(0, 300)}`)
  if (data.errors?.length) throw new Error(JSON.stringify(data.errors))

  let edges = data.data?.posts?.edges || []

  // 若 featured 今日为空，退回「今日全部按票数」
  if (!edges.length) {
    const fallbackQuery = `
      query TodayAll($after: DateTime!, $before: DateTime!, $first: Int!) {
        posts(first: $first, order: VOTES, postedAfter: $after, postedBefore: $before) {
          edges {
            node {
              name
              tagline
              url
              votesCount
              createdAt
              featuredAt
              topics { edges { node { name } } }
            }
          }
        }
      }
    `
    const res2 = await fetch('https://api.producthunt.com/v2/api/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      body: JSON.stringify({
        query: fallbackQuery,
        variables: { after: postedAfter, before: postedBefore, first: n },
      }),
    })
    const data2 = await res2.json().catch(() => ({}))
    if (!res2.ok) throw new Error(`Product Hunt API ${res2.status}`)
    if (data2.errors?.length) throw new Error(JSON.stringify(data2.errors))
    edges = data2.data?.posts?.edges || []
  }

  const items = edges.map(({ node }, idx) => {
    const topics = (node.topics?.edges || []).map((e) => e.node.name)
    const aiRelated =
      topics.some((t) => /ai|agent|developer|productivity|saas|llm/i.test(t)) ||
      /ai|agent|llm|gpt|claude|cursor/i.test(`${node.name} ${node.tagline}`)
    return {
      rank: idx + 1,
      name: node.name,
      tagline: node.tagline,
      url: node.url,
      votes: node.votesCount,
      createdAt: node.createdAt,
      featuredAt: node.featuredAt,
      topics,
      insight: `今日热榜 #${idx + 1}（▲${node.votesCount}）。${
        aiRelated ? '与 AI/开发相关，可评估能否用 Agent 复现其核心工作流。' : '观察增长与定位，思考 Agent 可切入的机会。'
      }`,
      aiRelated,
    }
  })

  return { day, postedAfter, postedBefore, items }
}

async function main() {
  loadEnvFiles()
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const date = todayUTC()
  let items = []
  let mode = 'fallback'
  let meta = {}
  const errors = []

  try {
    const token = await getAccessToken()
    if (!token) {
      items = FALLBACK
      errors.push('未设置 PRODUCTHUNT_TOKEN，使用兜底数据。')
    } else {
      const result = await fetchTodayTopByVotes(token, TOP_N)
      items = result.items
      meta = {
        phDay: result.day,
        postedAfter: result.postedAfter,
        postedBefore: result.postedBefore,
        ranking: 'VOTES',
        topN: TOP_N,
      }
      mode = 'api-today-votes-top10'
      if (!items.length) {
        errors.push('今日热榜为空，已写空列表。')
      }
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
    meta,
    items,
    errors,
  }

  const jsonPath = path.join(OUT_DIR, `${date}.json`)
  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), 'utf-8')

  const md = [
    `# Product Hunt 今日热榜 Top ${TOP_N} · ${date} (${mode})`,
    meta.phDay ? `> PH 日（太平洋时间）：${meta.phDay}` : '',
    '',
    ...items.map(
      (p, i) =>
        `## ${p.rank || i + 1}. [${p.name}](${p.url})\n- ▲ ${p.votes ?? 'n/a'} · ${p.tagline}\n- ${(p.topics || []).join(', ')}\n- ${p.insight}\n`,
    ),
  ]
    .filter(Boolean)
    .join('\n')
  fs.writeFileSync(path.join(OUT_DIR, `${date}.md`), md, 'utf-8')

  console.log(`producthunt: wrote ${items.length} items (${mode}) -> ${jsonPath}`)
  if (errors.length) console.warn(errors.join('\n'))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
