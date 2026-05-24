import { useState, useCallback, useRef } from 'react'
import Editor from '@monaco-editor/react'
import { createScriptDevice } from '../script-api'
import { useT } from '../i18n/I18nContext'
import { scriptExamples, getExampleByName, type ScriptExample } from '../script-examples'
import { generateScript, stopRecording, isRecording } from '../macro-recorder'
import { getWorkerBlobUrl } from '../script.worker'

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
  const { t } = useT()
  const [code, setCode] = useState(() => {
    try { return localStorage.getItem('ps-script') || TEMPLATE }
    catch { return TEMPLATE }
  })
  const [output, setOutput] = useState('')
  const [running, setRunning] = useState(false)
  const [showExamples, setShowExamples] = useState(false)
  const [useWorker, setUseWorker] = useState(true)
  const workerRef = useRef<Worker | null>(null)

  const addTx = (s: string, d: string) =>
    onTransaction({ timestamp: Date.now(), direction: 'tx', protocol: 'SCRIPT', summary: s, data: d })
  const addRx = (s: string, d: string) =>
    onTransaction({ timestamp: Date.now(), direction: 'rx', protocol: 'SCRIPT', summary: s, data: d })

  const addOutput = useCallback((msg: string) => {
    setOutput((prev) => prev + (prev ? '\n' : '') + msg)
  }, [])

  /* ── Run in Web Worker ─────────────────────────────── */
  const runInWorker = useCallback(
    (codeToRun: string): Promise<void> => {
      return new Promise((resolve, reject) => {
        try {
          const worker = new Worker(getWorkerBlobUrl())
          workerRef.current = worker

          worker.onmessage = (e) => {
            const msg = e.data
            if (msg.type === 'log' || msg.type === 'error') {
              addOutput(msg.data)
            } else if (msg.type === 'cmd') {
              // Proxy command to main process
              const { id, cmdType, payload } = msg
              addTx(`CMD 0x${cmdType.toString(16).toUpperCase()}`, payload.map((b: number) => b.toString(16).padStart(2, '0')).join(' '))
              window.deviceApi.sendCommand(cmdType, payload)
                .then((resp) => {
                  addRx(`RESP 0x${resp.type.toString(16).toUpperCase()}`, resp.payload.map((b: number) => b.toString(16).padStart(2, '0')).join(' '))
                  worker.postMessage({ type: 'cmd-response', id, payload: resp.payload })
                })
                .catch((err) => {
                  worker.postMessage({ type: 'cmd-response', id, error: err.message })
                })
            } else if (msg.type === 'done') {
              resolve()
            } else if (msg.type === 'error') {
              addOutput('ERROR: ' + msg.data)
              resolve()
            }
          }

          worker.onerror = (err) => {
            addOutput('Worker error: ' + err.message)
            resolve()
          }

          worker.postMessage({ type: 'run', id: 1, code: codeToRun })
        } catch (err: any) {
          addOutput('Failed to start worker: ' + err.message)
          resolve()
        }
      })
    },
    [addOutput, addTx, addRx]
  )

  /* ── Run in main thread (fallback) ───────────────────── */
  const runInMainThread = useCallback(
    async (codeToRun: string) => {
      const fakeConsole = {
        log: (...args: unknown[]) => {
          const msg = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')
          addOutput(msg)
        },
        error: (...args: unknown[]) => {
          const msg = 'ERROR: ' + args.map((a) => String(a)).join(' ')
          addOutput(msg)
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
          ${codeToRun}
        })()
      `
        const fn = new Function('device', 'console', 'delay', wrappedCode)
        await fn(device, fakeConsole, device.delay)
      } catch (err: any) {
        fakeConsole.error(err.message || String(err))
      }
    },
    [addOutput, addTx, addRx]
  )

  const handleRun = useCallback(async () => {
    if (!isConnected) return

    // Syntax validation
    try {
      new Function(code)
    } catch (err: any) {
      setOutput('Syntax error: ' + err.message)
      return
    }

    setRunning(true)
    setOutput('')

    if (useWorker) {
      await runInWorker(code)
    } else {
      await runInMainThread(code)
    }

    setRunning(false)
    if (workerRef.current) {
      workerRef.current.terminate()
      workerRef.current = null
    }
  }, [isConnected, code, useWorker, runInWorker, runInMainThread])

  const handleClear = useCallback(() => setOutput(''), [])
  const handleReset = useCallback(() => setCode(TEMPLATE), [])

  const handleCodeChange = useCallback((value: string | undefined) => {
    const v = value ?? ''
    setCode(v)
    try { localStorage.setItem('ps-script', v) } catch { /* noop */ }
  }, [])

  /* ── Load example ── */
  const handleLoadExample = useCallback((example: ScriptExample) => {
    handleCodeChange(example.code)
    setShowExamples(false)
  }, [handleCodeChange])

  /* ── Load recorded macro ── */
  const handleLoadMacro = useCallback(() => {
    if (isRecording()) return
    const rec = stopRecording()
    if (rec && rec.steps.length > 0) {
      const script = generateScript(rec)
      handleCodeChange(script)
    }
  }, [handleCodeChange])

  return (
    <div className="protocol-panel">
      <div className="pp-header">
        <span className="pp-icon">📜</span>
        <span className="pp-title">{t('script.title')}</span>
      </div>

      {/* Actions */}
      <div className="pp-row">
        <button
          className="pp-btn pp-btn--read"
          onClick={handleRun}
          disabled={running || !isConnected}
        >
          {running ? t('script.running') : t('script.run')}
        </button>
        <button className="pp-btn" onClick={handleClear} disabled={running}>
          {t('script.clearOutput')}
        </button>
        <button className="pp-btn" onClick={handleReset} disabled={running}>
          {t('script.resetTemplate')}
        </button>
        <button
          className={`pp-btn ${showExamples ? 'pp-btn--active' : ''}`}
          onClick={() => setShowExamples((v) => !v)}
        >
          {t('script.examples')}
        </button>
        <button className="pp-btn" onClick={handleLoadMacro} disabled={running || isRecording()}>
          📋 Load Macro
        </button>
        <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto', color: 'var(--text-muted)' }}>
          <input
            type="checkbox"
            checked={useWorker}
            onChange={(e) => setUseWorker(e.target.checked)}
          />
          Worker
        </label>
      </div>

      {/* Example Library Dropdown */}
      {showExamples && (
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: 8, marginBottom: 8, maxHeight: 200, overflow: 'auto', background: 'var(--bg-card)' }}>
          {scriptExamples.map((ex) => (
            <button
              key={ex.name}
              className="pp-chip"
              onClick={() => handleLoadExample(ex)}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', cursor: 'pointer', marginBottom: 2 }}
              title={ex.description}
            >
              <strong>{ex.name}</strong>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>{ex.description}</span>
            </button>
          ))}
        </div>
      )}

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
        <label>{t('script.output')}</label>
        <pre className="script-output">{output || (running ? 'Running…' : t('script.outputWaiting'))}</pre>
      </div>

      {/* Help */}
      <details className="pp-details">
        <summary className="pp-details-summary">{t('script.apiRef')}</summary>
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
