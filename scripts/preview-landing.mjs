import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { spawn } from 'node:child_process'

const root = path.resolve('dist')
const output = path.join(os.tmpdir(), 'peso-landing-preview')
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'peso-landing-browser-'))
await fs.mkdir(output, { recursive: true })
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const server = http.createServer(async (req, res) => {
  try {
    const relative = decodeURIComponent(new URL(req.url, 'http://local').pathname).replace(/^\/+/, '') || 'index.html'
    const file = path.resolve(root, relative)
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return }
    const data = await fs.readFile(file)
    res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' }[path.extname(file)] || 'application/octet-stream')
    res.end(data)
  } catch { res.writeHead(404); res.end() }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const address = `http://127.0.0.1:${server.address().port}`
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-extensions', '--disable-gpu', '--hide-scrollbars', `--user-data-dir=${profile}`, '--remote-debugging-port=0', 'about:blank'], { windowsHide: true, stdio: 'ignore' })
let socket
try {
  let port
  for (let attempt = 0; attempt < 100; attempt++) {
    try { port = (await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break } catch { await pause(100) }
  }
  if (!port) throw new Error('Headless browser did not start.')
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
  let sequence = 0
  const pending = new Map(), errors = []
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence
    pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }))
  })
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    if (message.id) {
      const request = pending.get(message.id)
      if (!request) return
      pending.delete(message.id)
      if (message.error) request.reject(new Error(message.error.message)); else request.resolve(message.result)
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text)
  })
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
    return result.result.value
  }
  await call('Page.enable'); await call('Runtime.enable')
  await call('Page.addScriptToEvaluateOnNewDocument', { source: 'localStorage.clear();sessionStorage.clear();' })
  const render = async (width, name) => {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 960, deviceScaleFactor: 1, mobile: width < 600 })
    await call('Page.navigate', { url: address })
    for (let i = 0; i < 60; i++) {
      if (await evaluate("!!document.querySelector('.landing-hero')")) break
      await pause(100)
    }
    await pause(1000)
    const checks = await evaluate("({ width:innerWidth, scroll:document.documentElement.scrollWidth, heroLoaded:document.querySelector('.landing-photo-frame img')?.naturalWidth>0, background:getComputedStyle(document.querySelector('.peso-landing')).backgroundColor, heading:document.querySelector('#landing-title')?.innerText })")
    if (checks.scroll > checks.width || !checks.heroLoaded) throw new Error(`Landing layout failed: ${JSON.stringify(checks)}`)
    const shot = await call('Page.captureScreenshot', { format: 'png' })
    await fs.writeFile(path.join(output, `${name}.png`), Buffer.from(shot.data, 'base64'))
    console.log(JSON.stringify({ screen: name, ...checks }))
    if (width < 600) {
      await evaluate("document.querySelector('.landing-menu-toggle').click()")
      if (!await evaluate("document.querySelector('.landing-menu-toggle').getAttribute('aria-expanded')==='true'")) throw new Error('Mobile menu did not open.')
      await evaluate("document.querySelector('.landing-menu-toggle').click()")
    }
  }
  await render(1440, 'landing-desktop')
  await render(390, 'landing-mobile')
  await render(320, 'landing-small-mobile')
  await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  await evaluate('location.reload()'); await pause(1000)
  const reduced = await evaluate("getComputedStyle(document.querySelector('.landing-photo-note')).animationName")
  if (reduced !== 'none') throw new Error('Reduced motion is not respected.')
  if (errors.length) throw new Error(`Browser errors: ${errors.join(', ')}`)
  console.log(JSON.stringify({ output, reducedMotion: reduced, runtimeErrors: errors }))
} finally {
  socket?.close(); chrome.kill(); server.close()
}
