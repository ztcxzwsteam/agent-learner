import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import type { Board, Goal, View } from './types'
import { loadBoard } from './loadBoard'

const NAV: { id: View; label: string; icon: string }[] = [
  { id: 'home', label: '今日', icon: '⌂' },
  { id: 'goals', label: '目标', icon: '☑' },
  { id: 'github', label: 'GitHub', icon: '⌘' },
  { id: 'ph', label: 'PH', icon: '✦' },
  { id: 'job', label: '求职', icon: '◎' },
  { id: 'about', label: '关于我', icon: '☺' },
]

function greeting() {
  const h = dayjs().hour()
  if (h < 12) return '早上好'
  if (h < 18) return '下午好'
  return '晚上好'
}

export default function App() {
  const [view, setView] = useState<View>('home')
  const [board, setBoard] = useState<Board | null>(null)
  const [goals, setGoals] = useState<Goal[]>([])
  const [draft, setDraft] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [log, setLog] = useState('')

  useEffect(() => {
    loadBoard().then((b) => {
      setBoard(b)
      setGoals(b.goals || [])
    })
  }, [])

  const openGoals = useMemo(() => goals.filter((g) => !g.done).length, [goals])

  async function persistGoals(next: Goal[]) {
    setGoals(next)
    try {
      await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: board?.date, items: next }),
      })
    } catch {
      localStorage.setItem('learner-goals', JSON.stringify(next))
    }
  }

  function toggleGoal(id: string) {
    const next = goals.map((g) => (g.id === id ? { ...g, done: !g.done } : g))
    void persistGoals(next)
  }

  function addGoal() {
    if (!draft.trim()) return
    const item: Goal = {
      id: `g-${Date.now()}`,
      text: draft.trim(),
      done: false,
      source: '手动',
      date: board?.date,
    }
    void persistGoals([item, ...goals])
    setDraft('')
  }

  async function syncNow() {
    setSyncing(true)
    setLog('同步中…')
    try {
      const res = await fetch('/api/sync', { method: 'POST' })
      const data = await res.json()
      setLog(data.log || '')
      if (data.board) {
        setBoard(data.board)
        setGoals(data.board.goals || [])
      } else {
        const b = await loadBoard()
        setBoard(b)
        setGoals(b.goals || [])
      }
    } catch (e) {
      setLog(String(e))
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className={`shell ${syncing ? 'syncing' : ''}`}>
      <aside className="rail">
        <div className="logo">Ag</div>
        {NAV.map((n) => (
          <button
            key={n.id}
            className={view === n.id ? 'active' : ''}
            title={n.label}
            onClick={() => setView(n.id)}
          >
            {n.icon}
          </button>
        ))}
      </aside>

      <main className="main">
        <div className="top">
          <div>
            <h1>{view === 'home' ? '今日工作台' : NAV.find((n) => n.id === view)?.label}</h1>
            <p>Agent 学习 · 实习/求职准备 · Harness 驱动</p>
          </div>
          <div className="chip">{board?.about?.role || '学习者'} · {board?.date || dayjs().format('YYYY-MM-DD')}</div>
        </div>

        {view === 'home' && board && (
          <>
            <section className="hero">
              <div>
                <h2>
                  {greeting()}！今天是 {dayjs(board.date).format('YYYY年M月D日')}
                </h2>
                <p>
                  未完成目标 <b>{openGoals}</b> 项 · GitHub {board.github.length} 个 · Product Hunt{' '}
                  {board.producthunt.length} 个
                  {board.producthuntMeta?.mode === 'fallback' ? '（PH 为精选兜底，可配置 TOKEN）' : ''}
                </p>
              </div>
              <div className="hero-actions">
                <button className="btn primary" onClick={syncNow}>
                  刷新今日探索
                </button>
                <button className="btn ghost" onClick={() => setView('goals')}>
                  编辑目标
                </button>
              </div>
            </section>

            <div className="stats">
              <div className="stat">
                <div className="label">今日目标</div>
                <div className="value">
                  {goals.filter((g) => g.done).length}/{goals.length || 0}
                </div>
              </div>
              <div className="stat">
                <div className="label">GitHub 探索</div>
                <div className="value">{board.github.length}</div>
              </div>
              <div className="stat">
                <div className="label">PH 热点</div>
                <div className="value">{board.producthunt.length}</div>
              </div>
              <div className="stat">
                <div className="label">GitHub 鉴权</div>
                <div className="value" style={{ fontSize: 18 }}>
                  {board.githubMeta?.auth ? 'Token' : '公开'}
                </div>
              </div>
            </div>

            <div className="grid">
              <div className="stack">
                <section className="card">
                  <div className="card-hd">
                    <h3>每日学习目标</h3>
                    <span className="tag warn">未完成 {openGoals}</span>
                  </div>
                  <div className="card-bd">
                    <ul className="todo-list">
                      {goals.map((g) => (
                        <li key={g.id} className={`todo-item ${g.done ? 'done' : ''}`}>
                          <input type="checkbox" checked={g.done} onChange={() => toggleGoal(g.id)} />
                          <div>
                            <div className="txt">{g.text}</div>
                            {g.source ? <div className="meta">来源 · {g.source}</div> : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                    <div className="add-row">
                      <input
                        value={draft}
                        placeholder="添加一条今日目标"
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addGoal()}
                      />
                      <button onClick={addGoal}>添加</button>
                    </div>
                  </div>
                </section>

                <section className="card">
                  <div className="card-hd">
                    <h3>GitHub Agent 项目探索</h3>
                    <span className="tag blue">今日 {board.github.length}</span>
                  </div>
                  <div className="card-bd">
                    {!board.github.length ? (
                      <div className="empty">暂无数据，点击「刷新今日探索」</div>
                    ) : (
                      <ul className="repo-list">
                        {board.github.map((r) => (
                          <li key={r.fullName} className="repo-item">
                            <a href={r.url} target="_blank" rel="noreferrer">
                              {r.fullName}
                            </a>
                            <div className="meta">
                              ⭐ {r.stars.toLocaleString()} · {r.language || 'n/a'}
                            </div>
                            <div style={{ marginTop: 6, fontSize: 13 }}>{r.description}</div>
                            <div className="meta">为何看：{r.reason}</div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </section>
              </div>

              <div className="stack">
                <section className="card">
                  <div className="card-hd">
                    <h3>Product Hunt 今日热点</h3>
                    <span className="tag orange">{board.producthuntMeta?.mode || 'n/a'}</span>
                  </div>
                  <div className="card-bd">
                    <ul className="ph-list">
                      {board.producthunt.map((p) => (
                        <li key={p.name + p.url} className="ph-item">
                          <a href={p.url} target="_blank" rel="noreferrer">
                            {p.name}
                          </a>
                          <div className="meta">
                            {p.tagline}
                            {p.votes != null ? ` · ▲ ${p.votes}` : ''}
                          </div>
                          <div style={{ marginTop: 6, fontSize: 13 }}>{p.insight}</div>
                        </li>
                      ))}
                    </ul>
                    {(board.producthuntMeta?.errors || []).length > 0 && (
                      <div className="meta" style={{ marginTop: 10 }}>
                        {board.producthuntMeta?.errors?.[0]}
                      </div>
                    )}
                  </div>
                </section>

                <section className="card">
                  <div className="card-hd">
                    <h3>求职提醒</h3>
                  </div>
                  <div className="card-bd">
                    <div className="ph-item">
                      每看完一个仓库，用一句话写进笔记：它怎么做 Agent 循环？和你目标岗位有何关系？
                    </div>
                    <div className="ph-item" style={{ marginTop: 8 }}>
                      本周至少推进作品一点：Demo / README / 简历项目描述。
                    </div>
                    <button className="btn primary" style={{ marginTop: 12 }} onClick={() => setView('job')}>
                      查看求职方向
                    </button>
                  </div>
                </section>

                {log ? (
                  <section className="card">
                    <div className="card-hd">
                      <h3>同步日志</h3>
                    </div>
                    <div className="card-bd">
                      <pre className="pre">{log}</pre>
                    </div>
                  </section>
                ) : null}
              </div>
            </div>
          </>
        )}

        {view === 'goals' && (
          <div className="page">
            <h2>全部目标</h2>
            <ul className="todo-list">
              {goals.map((g) => (
                <li key={g.id} className={`todo-item ${g.done ? 'done' : ''}`}>
                  <input type="checkbox" checked={g.done} onChange={() => toggleGoal(g.id)} />
                  <div className="txt">{g.text}</div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {view === 'github' && board && (
          <div className="page">
            <h2>GitHub 探索</h2>
            <ul className="repo-list">
              {board.github.map((r) => (
                <li key={r.fullName} className="repo-item">
                  <a href={r.url} target="_blank" rel="noreferrer">
                    {r.fullName}
                  </a>
                  <div className="meta">
                    ⭐ {r.stars.toLocaleString()} · {r.language || 'n/a'}
                  </div>
                  <div style={{ marginTop: 6 }}>{r.description}</div>
                  <div className="meta">为何看：{r.reason}</div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {view === 'ph' && board && (
          <div className="page">
            <h2>Product Hunt</h2>
            <ul className="ph-list">
              {board.producthunt.map((p) => (
                <li key={p.name + p.url} className="ph-item">
                  <a href={p.url} target="_blank" rel="noreferrer">
                    {p.name}
                  </a>
                  <div className="meta">{p.tagline}</div>
                  <div style={{ marginTop: 6 }}>{p.insight}</div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {view === 'about' && board && (
          <div className="page">
            <h2>关于我（Harness）</h2>
            <pre className="pre">{board.about.who}</pre>
            <h2 style={{ marginTop: 18 }}>求职方向</h2>
            <pre className="pre">{board.about.direction}</pre>
          </div>
        )}

        {view === 'job' && board && (
          <div className="page">
            <h2>求职准备</h2>
            <p style={{ color: '#78716c' }}>详细材料写在 `22 job-prep/`。当前方向摘要：</p>
            <pre className="pre">{board.about.direction}</pre>
          </div>
        )}
      </main>
    </div>
  )
}
