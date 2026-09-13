import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import type { Board, Goal, SearchResults, View } from './types'
import { NavIcon } from './NavIcon'
import {
  actionsRunUrl,
  canEmbedDshLocally,
  loadBoard,
  loadConfig,
  loadDshEndpoint,
  loadSearchResults,
  pingDsh,
  resolveDshFrameSrc,
  startDsh,
  triggerRemoteRefresh,
  waitForBoardUpdate,
  type BoardConfig,
} from './loadBoard'
import { DEFAULT_QUERY, resolveSearchToken, searchAgentRepos } from './githubSearch'

const NAV: { id: View; label: string }[] = [
  { id: 'home', label: '今天' },
  { id: 'goals', label: '目标' },
  { id: 'github', label: '仓库' },
  { id: 'ph', label: '产品' },
  { id: 'search', label: '搜索' },
  { id: 'job', label: '求职' },
  { id: 'about', label: '我' },
]

const QUICK_QUERIES = [
  'mcp server stars:>100',
  'langgraph OR crewai OR autogen stars:>200',
  'browser-use OR computer-use stars:>50',
  'ai agent OR llm-agent stars:>200',
]

function titleFor(view: View) {
  if (view === 'home') return '今天'
  return NAV.find((n) => n.id === view)?.label || ''
}

export default function App() {
  const [view, setView] = useState<View>('home')
  const [board, setBoard] = useState<Board | null>(null)
  const [goals, setGoals] = useState<Goal[]>([])
  const [draft, setDraft] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState<SearchResults | null>(null)
  const [dshUp, setDshUp] = useState<boolean | null>(null)
  const [dshStarting, setDshStarting] = useState(false)
  const [dshNote, setDshNote] = useState('')
  const [iframeKey, setIframeKey] = useState(0)
  const [boardCfg, setBoardCfg] = useState<BoardConfig>({})
  const [query, setQuery] = useState(DEFAULT_QUERY)
  const [searching, setSearching] = useState(false)
  const [searchErr, setSearchErr] = useState('')
  const [searchMode, setSearchMode] = useState<'repos' | 'dsh'>('repos')
  const [remoteDshUrl, setRemoteDshUrl] = useState<string | null>(null)
  const embedLocal = canEmbedDshLocally()
  const dshFrameSrc = resolveDshFrameSrc(boardCfg, Boolean(dshUp), remoteDshUrl)

  useEffect(() => {
    loadBoard().then((b) => {
      setBoard(b)
      setGoals(b.goals || [])
    })
    loadSearchResults().then((s) => {
      setSearch(s)
      if (s?.query) setQuery(s.query)
    })
    loadConfig().then(async (c) => {
      setBoardCfg(c)
      if (c.search?.defaultQuery) setQuery(c.search.defaultQuery)
      const ep = await loadDshEndpoint(c)
      setRemoteDshUrl(ep)
      // 飞书默认进 DSH（若已有公网地址）或仓库搜索
      if (!canEmbedDshLocally() && ep) setSearchMode('dsh')
    })
    if (embedLocal) pingDsh().then(setDshUp)
  }, [embedLocal])

  useEffect(() => {
    if (view !== 'search') return
    const tick = async () => {
      const ep = await loadDshEndpoint(boardCfg)
      setRemoteDshUrl((prev) => {
        if (ep && ep !== prev) setIframeKey((k) => k + 1)
        return ep
      })
      if (embedLocal) {
        const ok = await pingDsh()
        setDshUp(ok)
      }
    }
    void tick()
    const id = window.setInterval(() => void tick(), 8000)
    return () => window.clearInterval(id)
  }, [view, boardCfg, embedLocal])

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
    setStatus('正在更新…')
    const prevBuiltAt = board?.builtAt
    try {
      try {
        const res = await fetch('/api/sync', { method: 'POST' })
        if (res.ok) {
          const data = await res.json()
          setStatus(data.ok ? '已更新' : '更新未完全成功')
          if (data.board) {
            setBoard(data.board)
            setGoals(data.board.goals || [])
            return
          }
        }
      } catch {
        /* Feishu static */
      }

      const config = await loadConfig()
      try {
        await triggerRemoteRefresh(config)
        setStatus('已触发远程更新，等待写入…')
      } catch (dispatchErr) {
        const runUrl = actionsRunUrl(config)
        if (runUrl) {
          window.open(runUrl, '_blank', 'noopener,noreferrer')
          setStatus('请在打开的 Actions 页点击 Run workflow')
        } else {
          throw dispatchErr
        }
      }
      const next = await waitForBoardUpdate(prevBuiltAt)
      setBoard(next)
      setGoals(next.goals || [])
      setStatus(`已更新 · ${dayjs(next.builtAt).format('HH:mm')}`)
    } catch (e) {
      setStatus(String(e))
    } finally {
      setSyncing(false)
    }
  }

  async function bootDsh() {
    setDshStarting(true)
    setDshNote('正在启动…')
    const r = await startDsh()
    setDshNote(r.message || (r.ok ? '已请求启动' : '启动失败'))
    for (let i = 0; i < 20; i++) {
      await new Promise((x) => setTimeout(x, 1500))
      const ok = await pingDsh()
      if (ok) {
        setDshUp(true)
        setIframeKey((k) => k + 1)
        setDshNote('已就绪')
        setDshStarting(false)
        return
      }
    }
    setDshStarting(false)
    setDshNote('仍未检测到服务，可再试一次或运行 60 garage/start-dsh.bat')
  }

  async function runRepoSearch(q?: string) {
    setSearching(true)
    setSearchErr('')
    setSearchMode('repos')
    try {
      const cfg = Object.keys(boardCfg).length ? boardCfg : await loadConfig()
      if (!Object.keys(boardCfg).length) setBoardCfg(cfg)
      const token = await resolveSearchToken(cfg)
      const result = await searchAgentRepos({ query: q || query, limit: 10, token })
      setSearch(result)
      setQuery(result.query || query)
      try {
        localStorage.setItem('learner-github-search', JSON.stringify(result))
      } catch {
        /* ignore */
      }
    } catch (e) {
      setSearchErr(String(e))
    } finally {
      setSearching(false)
    }
  }

  const dateLabel = board?.date ? dayjs(board.date).format('YYYY年M月D日') : dayjs().format('YYYY年M月D日')

  return (
    <div className={`shell ${syncing ? 'busy' : ''} ${view === 'search' ? 'shell-search' : ''}`}>
      <aside className="sidebar">
        <div className="brand">
          学习台
          <span>实习准备 · 每日阅读</span>
        </div>
        <nav>
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              className={`nav-btn ${view === n.id ? 'active' : ''}`}
              onClick={() => setView(n.id)}
            >
              <span className="nav-icon">
                <NavIcon id={n.id} />
              </span>
              <span>{n.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      {view === 'search' ? (
        <main className="main main-dsh">
          <div className="dsh-toolbar">
            <div>
              <h1>搜索</h1>
              <p className="sub">DSH Agent 对话 · 也可搜 GitHub 仓库</p>
            </div>
            <div className="dsh-toolbar-actions">
              <button
                type="button"
                className={`btn ${searchMode === 'dsh' ? 'primary' : ''}`}
                onClick={() => setSearchMode('dsh')}
              >
                DSH Agent
              </button>
              <button
                type="button"
                className={`btn ${searchMode === 'repos' ? 'primary' : ''}`}
                onClick={() => setSearchMode('repos')}
              >
                仓库搜索
              </button>
            </div>
          </div>

          {searchMode === 'repos' ? (
            <div className="search-panel">
              <div className="search-bar">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void runRepoSearch()}
                  placeholder="GitHub 搜索词，例如 mcp server stars:>100"
                />
                <button type="button" className="btn primary" disabled={searching} onClick={() => void runRepoSearch()}>
                  {searching ? '搜索中…' : '搜索'}
                </button>
              </div>
              <div className="prompt-list compact">
                {QUICK_QUERIES.map((q) => (
                  <button
                    key={q}
                    type="button"
                    className="prompt"
                    onClick={() => {
                      setQuery(q)
                      void runRepoSearch(q)
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
              {searchErr ? <p className="search-err">{searchErr}</p> : null}
              {!search?.items?.length ? (
                <div className="empty">点「搜索」或一条快捷词。</div>
              ) : (
                <ul className="list search-list">
                  {search.items.map((r) => (
                    <li key={r.fullName} className="row">
                      <a className="title" href={r.url} target="_blank" rel="noreferrer">
                        {r.fullName}
                      </a>
                      <div className="meta">
                        {r.stars.toLocaleString()} stars · {r.language || '—'}
                      </div>
                      <div className="body">{r.description}</div>
                      <div className="meta">{r.reason}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : dshFrameSrc ? (
            <div className="dsh-frame-wrap">
              {!dshUp && embedLocal && !remoteDshUrl && !boardCfg.dshUrl ? (
                <div className="dsh-fallback">
                  <p>本机 DSH 未运行。</p>
                  <button type="button" className="btn primary" onClick={() => void bootDsh()} disabled={dshStarting}>
                    {dshStarting ? '启动中…' : '在本页启动 DSH'}
                  </button>
                  {dshNote ? <p className="meta">{dshNote}</p> : null}
                </div>
              ) : (
                <iframe
                  key={iframeKey}
                  className="dsh-frame"
                  title="DeepSeek Harness"
                  src={dshFrameSrc}
                  allow="clipboard-read; clipboard-write"
                />
              )}
            </div>
          ) : (
            <div className="dsh-fallback">
              <p>
                <b>要在飞书里用 DSH Agent</b>：先在电脑上双击运行
              </p>
              <pre className="pre">60 garage\start-dsh-for-feishu.bat</pre>
              <p className="meta">
                脚本会启动 DSH、开公网隧道、并推送地址到 GitHub。保持窗口不关，然后回到本页点下方刷新。
              </p>
              <button
                type="button"
                className="btn primary"
                onClick={async () => {
                  const ep = await loadDshEndpoint(boardCfg)
                  setRemoteDshUrl(ep)
                  if (ep) setIframeKey((k) => k + 1)
                  else setDshNote('还没读到公网地址：确认脚本已跑通并 git push 成功')
                }}
              >
                我已启动，刷新连接
              </button>
              {dshNote ? <p className="meta">{dshNote}</p> : null}
              {embedLocal && (
                <button
                  type="button"
                  className="btn"
                  style={{ marginTop: 10 }}
                  onClick={() => void bootDsh()}
                  disabled={dshStarting}
                >
                  {dshStarting ? '启动中…' : '仅本机启动（不经隧道）'}
                </button>
              )}
            </div>
          )}
        </main>
      ) : (
        <main className="main">
          <div className="column">
            <header className="page-hd">
              <div>
                <h1>{titleFor(view)}</h1>
                <p className="sub">
                  {dateLabel}
                  {view === 'home' && openGoals > 0 ? ` · 还剩 ${openGoals} 项目标` : ''}
                </p>
              </div>
              {(view === 'home' || view === 'github' || view === 'ph') && (
                <div className="hd-actions">
                  <button type="button" className="btn" onClick={syncNow} disabled={syncing}>
                    {syncing ? '更新中…' : '更新今日内容'}
                  </button>
                  {status ? <div className="status">{status}</div> : null}
                </div>
              )}
            </header>

            {view === 'home' && board && (
              <>
                <section className="section">
                  <div className="section-hd">
                    <h2>目标</h2>
                    <span className="hint">
                      {goals.filter((g) => g.done).length}/{goals.length}
                    </span>
                  </div>
                  {goals.length === 0 ? (
                    <div className="empty">还没有目标</div>
                  ) : (
                    goals.slice(0, 5).map((g) => (
                      <div key={g.id} className={`todo ${g.done ? 'done' : ''}`}>
                        <input type="checkbox" checked={g.done} onChange={() => toggleGoal(g.id)} />
                        <div>
                          <div className="txt">{g.text}</div>
                          {g.source ? <div className="meta">{g.source}</div> : null}
                        </div>
                      </div>
                    ))
                  )}
                  <div className="add-row">
                    <input
                      value={draft}
                      placeholder="加一条目标，回车保存"
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addGoal()}
                    />
                    <button type="button" className="btn" onClick={addGoal}>
                      添加
                    </button>
                  </div>
                  <p className="footer-link">
                    <button type="button" onClick={() => setView('goals')}>
                      查看全部目标
                    </button>
                  </p>
                </section>

                <section className="section">
                  <div className="section-hd">
                    <h2>仓库</h2>
                    <span className="hint">{board.github.length} 个</span>
                  </div>
                  {!board.github.length ? (
                    <div className="empty">暂无内容，点右上角「更新今日内容」</div>
                  ) : (
                    <ul className="list">
                      {board.github.map((r) => (
                        <li key={r.fullName} className="row">
                          <a className="title" href={r.url} target="_blank" rel="noreferrer">
                            {r.fullName}
                          </a>
                          <div className="meta">
                            {r.stars.toLocaleString()} stars · {r.language || '—'}
                          </div>
                          <div className="body">{r.description}</div>
                          <div className="meta">{r.reason}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="footer-link">
                    <button type="button" onClick={() => setView('search')}>
                      打开搜索
                    </button>
                  </p>
                </section>

                <section className="section">
                  <div className="section-hd">
                    <h2>产品</h2>
                    <span className="hint">
                      热榜 Top {board.producthuntMeta?.topN || 10}
                      {board.producthuntMeta?.phDay ? ` · ${board.producthuntMeta.phDay}` : ''}
                    </span>
                  </div>
                  <ul className="list">
                    {board.producthunt.slice(0, 5).map((p, i) => (
                      <li key={p.name + p.url} className="row">
                        <a className="title" href={p.url} target="_blank" rel="noreferrer">
                          #{p.rank || i + 1} {p.name}
                        </a>
                        <div className="meta">
                          {p.tagline}
                          {p.votes != null ? ` · ${p.votes} votes` : ''}
                        </div>
                      </li>
                    ))}
                  </ul>
                  <p className="footer-link">
                    <button type="button" onClick={() => setView('ph')}>
                      看完整热榜
                    </button>
                  </p>
                </section>

                <section className="section">
                  <p className="footer-link">
                    <button type="button" onClick={() => setView('job')}>
                      求职方向与缺口清单
                    </button>
                  </p>
                </section>
              </>
            )}

            {view === 'goals' && (
              <section className="section">
                {goals.map((g) => (
                  <div key={g.id} className={`todo ${g.done ? 'done' : ''}`}>
                    <input type="checkbox" checked={g.done} onChange={() => toggleGoal(g.id)} />
                    <div className="txt">{g.text}</div>
                  </div>
                ))}
                <div className="add-row">
                  <input
                    value={draft}
                    placeholder="加一条目标"
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addGoal()}
                  />
                  <button type="button" className="btn" onClick={addGoal}>
                    添加
                  </button>
                </div>
              </section>
            )}

            {view === 'github' && board && (
              <section className="section">
                <p className="lead">每日固定清单（高星搜索 + 种子仓库），与 DSH 临时搜索分开。</p>
                <ul className="list">
                  {board.github.map((r) => (
                    <li key={r.fullName} className="row">
                      <a className="title" href={r.url} target="_blank" rel="noreferrer">
                        {r.fullName}
                      </a>
                      <div className="meta">
                        {r.stars.toLocaleString()} stars · {r.language || '—'}
                      </div>
                      <div className="body">{r.description}</div>
                      <div className="meta">{r.reason}</div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {view === 'ph' && board && (
              <section className="section">
                <p className="lead">
                  按 Product Hunt 当日投票排序
                  {board.producthuntMeta?.phDay ? `（PH 日 ${board.producthuntMeta.phDay}）` : ''}
                </p>
                <ul className="list">
                  {board.producthunt.map((p, i) => (
                    <li key={p.name + p.url} className="row">
                      <a className="title" href={p.url} target="_blank" rel="noreferrer">
                        #{p.rank || i + 1} {p.name}
                      </a>
                      <div className="meta">
                        {p.tagline}
                        {p.votes != null ? ` · ${p.votes} votes` : ''}
                      </div>
                      <div className="body">{p.insight}</div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {view === 'about' && board && (
              <section className="section">
                <div className="section-hd">
                  <h2>我是谁</h2>
                </div>
                <pre className="pre">{board.about.who || '（空）'}</pre>
                <div className="section-hd" style={{ marginTop: 24 }}>
                  <h2>求职方向</h2>
                </div>
                <pre className="pre">{board.about.direction || '（空）'}</pre>
              </section>
            )}

            {view === 'job' && board && (
              <section className="section">
                <p className="lead">材料写在仓库的 22 job-prep/。下面是方向摘要。</p>
                <pre className="pre">{board.about.direction || '（空）'}</pre>
              </section>
            )}
          </div>
        </main>
      )}
    </div>
  )
}
