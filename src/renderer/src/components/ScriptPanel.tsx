import { useState, useCallback, useRef } from 'react'
import Editor from '@monaco-editor/react'
import { createScriptDevice } from '../script-api'

interface Props {
  isConnected: boolean
  onTransaction: (entry: {
    timestamp: number; direction: 'tx' | 'rx'; protocol: string
    summary: string; data: string
  }) => void
}

const TEMPLATE = `// probe-station Script
// device object is pre-injected — all methods are async

const info = await device.sys.getInfo()
console.log('Firmware:', info.fw)
console.log('Protocols:', info.protocols)

// I2C Example:
// const addrs = await device.i2c.scan({ channel: 0 })
// console.log('Found:', addrs.map(a => '0x' + a.toString(16)).join(', '))
// const data = await device.i2c.read({ channel: 0, addr: 0x68, reg: 0x00, len: 6 })
// console.log('Data:', data.map(b => b.toString(16).padStart(2, '0')).join(' '))

console.log('Done.')
`

export default function ScriptPanel({ isConnected, onTransaction }: Props) {
  const [code, setCode] = useState(() => {
    try { return localStorage.getItem('ps-script') || TEMPLATE }
    catch { return TEMPLATE }
  })
  const [output, setOutput] = useState('')
  const [running, setRunning] = useState(false)

  const addTx = (s: string, d: string) =>
    onTransaction({ timestamp: Date.now(), direction: 'tx', protocol: 'SCRIPT', summary: s, data: d })
  const addRx = (s: string, d: string) =>
    onTransaction({ timestamp: Date.now(), direction: 'rx', protocol: 'SCRIPT', summary: s, data: d })

  const handleRun = useCallback(async () => {
    if (!isConnected) return
    setRunning(true)
    setOutput('')
    const lines: string[] = []

    const fakeConsole = {
      log: (...args: unknown[]) => {
        const msg = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')
        lines.push(msg)
        setOutput(lines.join('\n'))
      },
      error: (...args: unknown[]) => {
        const msg = 'ERROR: ' + args.map((a) => String(a)).join(' ')
        lines.push(msg)
        setOutput(lines.join('\n'))
      },
    }

    const send = async (type: number, payload: number[]) => {
      addTx(`CMD 0x${type.toString(16).toUpperCase()}`, payload.map((b) => b.toString(16).padStart(2, '0')).join(' '))
      const resp = await window.deviceApi.sendCommand(type, payload)
      addRx(`RESP 0x${resp.type.toString(16).toUpperCase()}`, resp.payload.map((b) => b.toString(16).padStart(2, '0')).join(' '))
      return resp
    }

    const device = createScriptDevice(send)

    try {
      const wrappedCode = `
        return (async () => {
          ${code}
        })()
      `
      const fn = new Function('device', 'console', 'delay', wrappedCode)
      await fn(device, fakeConsole, device.delay)
    } catch (err: any) {
      fakeConsole.error(err.message || String(err))
    } finally {
      setRunning(false)
    }
  }, [isConnected, code, addTx, addRx])

  const handleClear = useCallback(() => setOutput(''), [])
  const handleReset = useCallback(() => setCode(TEMPLATE), [])

  const handleCodeChange = useCallback((value: string | undefined) => {
    const v = value ?? ''
    setCode(v)
    try { localStorage.setItem('ps-script', v) } catch { /* noop */ }
  }, [])

  return (
    <div className="protocol-panel">
      <div className="pp-header">
        <span className="pp-icon">📜</span>
        <span className="pp-title">Script</span>
      </div>

      {/* Actions */}
      <div className="pp-row">
        <button
          className="pp-btn pp-btn--read"
          onClick={handleRun}
          disabled={running || !isConnected}
        >
          {running ? '⏳ Running…' : '▶ Run'}
        </button>
        <button className="pp-btn" onClick={handleClear} disabled={running}>
          Clear Output
        </button>
        <button className="pp-btn" onClick={handleReset} disabled={running}>
          Reset Template
        </button>
      </div>

      {/* Monaco Editor */}
      <div className="pp-field pp-field--grow">
        <label>Script (JavaScript)</label>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
          <Editor
            height="300px"
            language="javascript"
            theme="vs-dark"
            value={code}
            onChange={handleCodeChange}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              fontFamily: 'var(--font-mono, monospace)',
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
              wordWrap: 'on',
              padding: { top: 8 },
            }}
          />
        </div>
      </div>

      {/* Output */}
      <div className="pp-field pp-field--grow">
        <label>Output</label>
        <pre className="script-output">{output || (running ? 'Running…' : 'Output will appear here')}</pre>
      </div>

      {/* Help */}
      <details className="pp-details">
        <summary className="pp-details-summary">API Reference</summary>
        <div className="script-help">
          <code>
            device.sys.ping()<br />
            device.sys.getInfo() → {'{'}fw, protocols{'}'}<br />
            <br />
            device.i2c.scan({'{}'}channel, speed{'?'}) → address[]<br />
            device.i2c.read({'{}'}channel, addr, reg, len{'}'}) → data[]<br />
            device.i2c.write({'{}'}channel, addr, reg, data{'}'})<br />
            <br />
            device.spi.transfer({'{}'}bus, mode, speedKHz, cs, data{'}'}) → data[]<br />
            <br />
            device.uart.config({'{}'}port, baud, dataBits, parity?, stopBits?{'}'})<br />
            device.uart.write(port, data[])<br />
            device.uart.read(port, timeoutMs?) → data[]<br />
            <br />
            device.can.config({'{}'}bitrate, mode?, fd?, termination?{'}'})<br />
            device.can.sendFrame({'{}'}id, data, ide?{'}'})<br />
            <br />
            device.gpio.config(pin, mode, pull)<br />
            device.gpio.write(pin, value)<br />
            device.gpio.read(pin) → value<br />
            <br />
            device.delay(ms) — wait ms milliseconds<br />
            console.log(...args) — print to output
          </code>
        </div>
      </details>
    </div>
  )
}
