import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')
const SCRIPTS = __dirname

function today() {
  return new Date().toISOString().slice(0, 10)
}

function run(script) {
  const r = spawnSync(process.execPath, [path.join(SCRIPTS, script)], {
    cwd: path.join(ROOT, 'workbench'),
    env: process.env,
    encoding: 'utf-8',
  })
  if (r.stdout) process.stdout.write(r.stdout)
  if (r.stderr) process.stderr.write(r.stderr)
  if (r.status !== 0) throw new Error(`${script} failed`)
}

function readJson(p) {
  if (!fs.existsSync(p)) return null
  return JSON.parse(fs.readFileSync(p, 'utf-8'))
}

function defaultGoals(date) {
  return [
    {
      id: 'g1',
      text: '精读 1 个今日 GitHub 推荐仓库的 README，写 5 行架构笔记',
      done: false,
      source: '系统建议',
    },
    {
      id: 'g2',
      text: '从 Product Hunt 选 1 个产品，写「若用 Agent 复现会怎么做」',
      done: false,
      source: '系统建议',
    },
    {
      id: 'g3',
      text: '推进求职材料：更新简历中的 Agent 项目描述 1 段，或刷 2 道相关面试题',
      done: false,
      source: '系统建议',
    },
  ].map((g) => ({ ...g, date }))
}

function main() {
  const skipSync = process.argv.includes('--no-sync')
  if (!skipSync) {
    run('sync-github.mjs')
    run('sync-producthunt.mjs')
  }

  const date = today()
  const github = readJson(path.join(ROOT, '23 explore', 'github', `${date}.json`))
  const ph = readJson(path.join(ROOT, '23 explore', 'producthunt', `${date}.json`))

  const goalsPath = path.join(ROOT, '20 learning', 'daily', `${date}.goals.json`)
  fs.mkdirSync(path.dirname(goalsPath), { recursive: true })
  let goals = readJson(goalsPath)
  if (!goals?.items?.length) {
    goals = { date, items: defaultGoals(date), updatedAt: new Date().toISOString() }
    fs.writeFileSync(goalsPath, JSON.stringify(goals, null, 2), 'utf-8')
  }

  const about = {
    role: 'Agent 学习者 / 求职者',
    who: fs.existsSync(path.join(ROOT, '10 about-me', '我是谁.md'))
      ? fs.readFileSync(path.join(ROOT, '10 about-me', '我是谁.md'), 'utf-8')
      : '',
    direction: fs.existsSync(path.join(ROOT, '10 about-me', '求职方向.md'))
      ? fs.readFileSync(path.join(ROOT, '10 about-me', '求职方向.md'), 'utf-8')
      : '',
  }

  const board = {
    date,
    builtAt: new Date().toISOString(),
    about,
    goals: goals.items,
    github: github?.items || [],
    githubMeta: { syncedAt: github?.syncedAt, auth: github?.auth, errors: github?.errors || [] },
    producthunt: ph?.items || [],
    producthuntMeta: { syncedAt: ph?.syncedAt, mode: ph?.mode, errors: ph?.errors || [] },
    links: {
      githubMd: `23 explore/github/${date}.md`,
      phMd: `23 explore/producthunt/${date}.md`,
      goalsJson: `20 learning/daily/${date}.goals.json`,
    },
  }

  const dailyDir = path.join(ROOT, '23 explore', 'daily')
  fs.mkdirSync(dailyDir, { recursive: true })
  const out = path.join(dailyDir, `${date}.json`)
  fs.writeFileSync(out, JSON.stringify(board, null, 2), 'utf-8')

  // also copy to workbench public for static hosting
  const pub = path.join(ROOT, 'workbench', 'public', 'daily-board.json')
  fs.mkdirSync(path.dirname(pub), { recursive: true })
  fs.writeFileSync(pub, JSON.stringify(board, null, 2), 'utf-8')

  console.log(`daily board -> ${out}`)
}

main()
