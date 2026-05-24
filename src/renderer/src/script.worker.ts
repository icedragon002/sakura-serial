/**
 * probe-station — Script Web Worker
 *
 * Executes user scripts in a sandboxed Web Worker to prevent
 * blocking the renderer UI thread. Communicates via postMessage.
 *
 * The worker receives script code + sendCommand proxy info,
 * and returns console output + results.
 */

export interface WorkerRequest {
  id: number
  code: string
}

export interface WorkerResponse {
  id: number
  type: 'log' | 'error' | 'result' | 'done'
  data: string
}

/* ── Worker source (inlined as Blob URL) ──────────── */

const workerSource = `
// probe-station Script Worker

// The worker has no direct access to window.deviceApi.
// Instead, commands are proxied back to the main thread via postMessage.
// For simplicity, we expose a synchronous-looking API using Atomics.wait
// or use an async proxy pattern.

let pendingId = 0
const pending = new Map()

// Listen for command responses from main thread
self.onmessage = function(e) {
  const msg = e.data

  if (msg.type === 'cmd-response') {
    const resolver = pending.get(msg.id)
    if (resolver) {
      pending.delete(msg.id)
      if (msg.error) {
        resolver.reject(new Error(msg.error))
      } else {
        resolver.resolve(msg.payload)
      }
    }
  }
}

// Proxy sendCommand to main thread
function sendCommand(type, payload) {
  return new Promise((resolve, reject) => {
    const id = ++pendingId
    pending.set(id, { resolve, reject })
    self.postMessage({ type: 'cmd', id, cmdType: type, payload })
    // Timeout after 10s
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id)
        reject(new Error('Command timeout'))
      }
    }, 10000)
  })
}

// Console proxy
const console = {
  _logs: [],
  log(...args) {
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')
    this._logs.push(msg)
    self.postMessage({ type: 'log', data: msg })
  },
  error(...args) {
    const msg = 'ERROR: ' + args.map(a => String(a)).join(' ')
    this._logs.push(msg)
    self.postMessage({ type: 'error', data: msg })
  }
}

// Device API — mirrors script-api.ts but uses sendCommand proxy
// Minimal implementation for common commands
const device = {
  sys: {
    async ping() { await sendCommand(0x10, []) },
    async getInfo() {
      const resp = await sendCommand(0x11, [])
      return { fw: String.fromCharCode(...resp.payload.slice(1, 1 + resp.payload[0])), protocols: resp.payload.slice(0) }
    },
  },
  i2c: {
    async scan(opts) {
      const speedCode = (opts.speed || 400000) === 100000 ? 0 : 1
      const resp = await sendCommand(0x20, [opts.channel || 0, speedCode])
      return Array.from(resp.payload || [])
    },
    async read(opts) {
      const resp = await sendCommand(0x21, [opts.channel || 0, opts.addr, (opts.reg >> 8) & 0xff, opts.reg & 0xff, (opts.len >> 8) & 0xff, opts.len & 0xff])
      return Array.from(resp.payload || [])
    },
    async write(opts) {
      await sendCommand(0x22, [opts.channel || 0, opts.addr, (opts.reg >> 8) & 0xff, opts.reg & 0xff, ...(opts.data || [])])
    },
  },
  spi: {
    async transfer(opts) {
      const speed100kHz = Math.max(1, Math.round((opts.speedKHz || 1000) / 100))
      const resp = await sendCommand(0x30, [opts.bus || 0, opts.mode || 0, speed100kHz, opts.cs || 0, 0, (opts.data.length >> 8) & 0xff, opts.data.length & 0xff, ...(opts.data || [])])
      return Array.from(resp.payload || [])
    },
    async csControl(bus, cs, state) { await sendCommand(0x31, [bus, cs, state]) },
  },
  uart: {
    async config(opts) {
      const parMap = { none: 0, even: 1, odd: 2, mark: 3, space: 4 }
      await sendCommand(0x40, [opts.port || 0, (opts.baud >> 24) & 0xff, (opts.baud >> 16) & 0xff, (opts.baud >> 8) & 0xff, opts.baud & 0xff, opts.dataBits || 8, parMap[opts.parity || 'none'] || 0, opts.stopBits || 1])
    },
    async write(port, data) { await sendCommand(0x41, [port, ...data]) },
    async read(port, timeoutMs = 100) {
      const resp = await sendCommand(0x42, [port, (timeoutMs >> 8) & 0xff, timeoutMs & 0xff])
      return Array.from(resp.payload || [])
    },
  },
  can: {
    async config(opts) {
      await sendCommand(0x50, [opts.mode || 0, (opts.bitrate >> 24) & 0xff, (opts.bitrate >> 16) & 0xff, (opts.bitrate >> 8) & 0xff, opts.bitrate & 0xff, opts.fd || 0, opts.termination || 1])
    },
    async sendFrame(opts) {
      await sendCommand(0x51, [(opts.id >> 24) & 0xff, (opts.id >> 16) & 0xff, (opts.id >> 8) & 0xff, opts.id & 0xff, opts.ide || 0, opts.data.length, ...opts.data])
    },
    async startMonitor() { await sendCommand(0x53, [1]) },
    async stopMonitor() { await sendCommand(0x53, [0]) },
  },
  onewire: {
    async reset() {
      const resp = await sendCommand(0x60, [])
      return (resp.payload && resp.payload[0]) === 1
    },
    async search() {
      const resp = await sendCommand(0x61, [])
      const roms = []
      for (let i = 0; i + 7 < (resp.payload || []).length; i += 8) roms.push(resp.payload.slice(i, i + 8))
      return roms
    },
    async read(rom, cmd, len) {
      const resp = await sendCommand(0x62, [...rom, cmd, (len >> 8) & 0xff, len & 0xff])
      return Array.from(resp.payload || [])
    },
    async write(rom, data) { await sendCommand(0x63, [...rom, ...data]) },
  },
  gpio: {
    async config(pin, mode, pull) { await sendCommand(0x70, [pin, mode, pull]) },
    async write(pin, value) { await sendCommand(0x71, [pin, value]) },
    async read(pin) {
      const resp = await sendCommand(0x72, [pin])
      return (resp.payload && resp.payload[0]) || 0
    },
    async pwm(pin, freq, duty) {
      await sendCommand(0x73, [pin, (freq >> 24) & 0xff, (freq >> 16) & 0xff, (freq >> 8) & 0xff, freq & 0xff, (duty >> 8) & 0xff, duty & 0xff])
    },
  },
  la: {
    async config(opts) {
      await sendCommand(0x80, [opts.channels || 0xff, (opts.sampleRateKHz >> 24) & 0xff, (opts.sampleRateKHz >> 16) & 0xff, (opts.sampleRateKHz >> 8) & 0xff, opts.sampleRateKHz & 0xff, 0, 0, 0, 0, 0x10, 0, 0, 0, 0x10, 0, 1])
    },
    async start() { await sendCommand(0x81, []) },
    async stop() { await sendCommand(0x82, []) },
    async status() {
      const resp = await sendCommand(0x84, [])
      return (resp.payload && resp.payload[0]) || 0
    },
  },
  delay(ms) { return new Promise(r => setTimeout(r, ms)) },
}

// Execute user code
self.onmessage = function(e) {
  if (e.data.type !== 'run') return
  const { id, code } = e.data

  const wrappedCode = \`
    return (async () => {
      try {
        \${code}
      } catch (err) {
        console.error(err.message || String(err))
      }
    })()
  \`

  const fn = new Function('device', 'console', wrappedCode)
  fn(device, console).then(() => {
    self.postMessage({ type: 'done', id })
  }).catch((err) => {
    self.postMessage({ type: 'error', id, data: err.message || String(err) })
    self.postMessage({ type: 'done', id })
  })
}
`

let workerBlobUrl: string | null = null

export function getWorkerBlobUrl(): string {
  if (!workerBlobUrl) {
    const blob = new Blob([workerSource], { type: 'application/javascript' })
    workerBlobUrl = URL.createObjectURL(blob)
  }
  return workerBlobUrl
}

export function terminateWorkerBlob(): void {
  if (workerBlobUrl) {
    URL.revokeObjectURL(workerBlobUrl)
    workerBlobUrl = null
  }
}
