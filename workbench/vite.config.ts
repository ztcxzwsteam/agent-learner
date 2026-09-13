import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import fs from 'node:fs'
import { spawn } from 'node:child_process'

const ROOT = path.resolve(import.meta.dirname, '..')

function today() {
  return new Date().toISOString().slice(0, 10)
}

function readBoard() {
  const p = path.join(ROOT, '23 explore', 'daily', `${today()}.json`)
  const fallback = path.join(ROOT, 'workbench', 'public', 'daily-board.json')
  if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'))
  if (fs.existsSync(fallback)) return JSON.parse(fs.readFileSync(fallback, 'utf-8'))
  return null
}

function apiPlugin(): Plugin {
  return {
    name: 'learner-api',
    configureServer(server) {
      server.middlewares.use('/api/board', (req, res, next) => {
        if (req.method === 'GET' && (req.url === '/' || req.url === '' || req.url?.startsWith('?'))) {
          const board = readBoard()
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify(board || { error: 'no board', hint: 'run npm run sync' }))
          return
        }
        next()
      })

      server.middlewares.use('/api/goals', (req, res, next) => {
        if (req.method !== 'POST') return next()
        let body = ''
        req.on('data', (c) => (body += c))
        req.on('end', () => {
          try {
            const data = JSON.parse(body)
            const date = data.date || today()
            const goalsPath = path.join(ROOT, '20 learning', 'daily', `${date}.goals.json`)
            fs.mkdirSync(path.dirname(goalsPath), { recursive: true })
            const payload = {
              date,
              items: data.items || [],
              updatedAt: new Date().toISOString(),
            }
            fs.writeFileSync(goalsPath, JSON.stringify(payload, null, 2), 'utf-8')

            const boardPath = path.join(ROOT, '23 explore', 'daily', `${date}.json`)
            if (fs.existsSync(boardPath)) {
              const board = JSON.parse(fs.readFileSync(boardPath, 'utf-8'))
              board.goals = payload.items
              board.builtAt = new Date().toISOString()
              fs.writeFileSync(boardPath, JSON.stringify(board, null, 2), 'utf-8')
              fs.writeFileSync(
                path.join(ROOT, 'workbench', 'public', 'daily-board.json'),
                JSON.stringify(board, null, 2),
                'utf-8',
              )
            }
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true }))
          } catch (e) {
            res.statusCode = 400
            res.end(JSON.stringify({ ok: false, error: String(e) }))
          }
        })
      })

      server.middlewares.use('/api/sync', (req, res, next) => {
        if (req.method !== 'POST') return next()
        const child = spawn(process.execPath, [path.join(ROOT, 'workbench', 'scripts', 'build-daily.mjs')], {
          cwd: path.join(ROOT, 'workbench'),
          env: process.env,
        })
        let out = ''
        child.stdout.on('data', (d) => (out += d))
        child.stderr.on('data', (d) => (out += d))
        child.on('close', (code) => {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: code === 0, code, log: out, board: readBoard() }))
        })
      })
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), apiPlugin()],
  server: { port: 5180, host: true },
})
