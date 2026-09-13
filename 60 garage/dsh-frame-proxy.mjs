/**
 * 把本机 DSH (3080) 反代到 3081，去掉 X-Frame-Options / 收紧 CSP，
 * 以便飞书工作台用 iframe 嵌入。
 */
import http from 'node:http'
import net from 'node:net'

const TARGET_HOST = '127.0.0.1'
const TARGET_PORT = Number(process.env.DSH_PORT || 3080)
const LISTEN_PORT = Number(process.env.DSH_PROXY_PORT || 3081)

function scrubHeaders(headers) {
  const out = { ...headers }
  for (const key of Object.keys(out)) {
    const k = key.toLowerCase()
    if (k === 'x-frame-options' || k === 'content-security-policy') delete out[key]
  }
  out['content-security-policy'] = 'frame-ancestors *;'
  return out
}

const server = http.createServer((req, res) => {
  const headers = { ...req.headers, host: `${TARGET_HOST}:${TARGET_PORT}` }
  const upstream = http.request(
    {
      hostname: TARGET_HOST,
      port: TARGET_PORT,
      path: req.url,
      method: req.method,
      headers,
    },
    (up) => {
      res.writeHead(up.statusCode || 502, scrubHeaders(up.headers))
      up.pipe(res)
    },
  )
  upstream.on('error', (err) => {
    res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
    res.end(`DSH proxy error: ${err.message}\n请确认 DSH 已在 ${TARGET_PORT} 启动。`)
  })
  req.pipe(upstream)
})

server.on('upgrade', (req, socket, head) => {
  const upstream = net.connect(TARGET_PORT, TARGET_HOST, () => {
    const lines = [`${req.method} ${req.url} HTTP/1.1`]
    const headers = { ...req.headers, host: `${TARGET_HOST}:${TARGET_PORT}` }
    for (const [k, v] of Object.entries(headers)) {
      if (v == null) continue
      if (Array.isArray(v)) v.forEach((x) => lines.push(`${k}: ${x}`))
      else lines.push(`${k}: ${v}`)
    }
    lines.push('', '')
    upstream.write(lines.join('\r\n'))
    if (head && head.length) upstream.write(head)
    upstream.pipe(socket)
    socket.pipe(upstream)
  })
  upstream.on('error', () => socket.destroy())
  socket.on('error', () => upstream.destroy())
})

server.listen(LISTEN_PORT, '127.0.0.1', () => {
  console.log(`dsh-frame-proxy: http://127.0.0.1:${LISTEN_PORT} -> ${TARGET_HOST}:${TARGET_PORT}`)
})
