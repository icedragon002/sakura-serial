import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { CMD_GPIO_CFG, CMD_GPIO_WRITE, CMD_GPIO_READ, CMD_GPIO_PWM, EVENT_GPIO_CHANGE, EVENT_OVERCURRENT, EVENT_THERMAL_WARNING } from '../../../shared/commands'
import { useT } from '../i18n/I18nContext'
import { recordStep } from '../macro-recorder'

interface Props {
  isConnected: boolean
  onTransaction: (entry: {
    timestamp: number; direction: 'tx' | 'rx'; protocol: string
    summary: string; data: string
  }) => void
}

type GpioMode = 'in' | 'out' | 'pwm' | 'freq'
type GpioPull = 'none' | 'up' | 'down'

const MODE_MAP: Record<GpioMode, number> = { in: 0, out: 1, pwm: 2, freq: 3 }
const PULL_MAP: Record<GpioPull, number> = { none: 0, up: 1, down: 2 }

export default function GPIOPanel({ isConnected, onTransaction }: Props) {
  const { t } = useT()
  const [pin, setPin] = useState(0)
  const [mode, setMode] = useState<GpioMode>('out')
  const [pull, setPull] = useState<GpioPull>('none')
  const [outputVal, setOutputVal] = useState(0)
  const [pwmFreq, setPwmFreq] = useState(1000)
  const [pwmDuty, setPwmDuty] = useState(500) // per-mille
  const [readVal, setReadVal] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [monitoring, setMonitoring] = useState(false)
  const monitorRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [events, setEvents] = useState<string[]>([])

  /* ── Monitor toggle ── */
  const toggleMonitor = useCallback(() => {
    if (monitoring) {
      if (monitorRef.current) { clearInterval(monitorRef.current); monitorRef.current = null }
      setMonitoring(false)
      return
    }
    setMonitoring(true)
    monitorRef.current = setInterval(async () => {
      try {
        const resp = await window.deviceApi.sendCommand(CMD_GPIO_READ, Array.from(new Uint8Array([pin])))
        const v = resp.payload.length > 0 ? resp.payload[0] : 0
        const ts = new Date().toLocaleTimeString('en-US', { hour12: false })
        setEvents((prev) => {
          const next = [...prev, `${ts} GPIO${pin}=${v}`]
          return next.length > 30 ? next.slice(-30) : next
        })
        setReadVal(v)
      } catch { /* poll silently fails */ }
    }, 500)
    // Cleanup on unmount
    return () => { if (monitorRef.current) clearInterval(monitorRef.current) }
  }, [monitoring, pin])

  useEffect(() => {
    return () => { if (monitorRef.current) clearInterval(monitorRef.current) }
  }, [])

  /* ── Async event listener ── */
  useEffect(() => {
    if (!isConnected) return
    const cleanup = window.deviceApi.onAsyncEvent((eventType, payload) => {
      if (eventType === EVENT_GPIO_CHANGE && payload.length >= 2) {
        const p = payload[0]
        const v = payload[1]
        setEvents((prev) => {
          const next = [...prev, `GPIO${p} → ${v}`]
          return next.length > 20 ? next.slice(-20) : next
        })
        addRx(`EVENT GPIO${p}`, String(v))
      } else if (eventType === EVENT_OVERCURRENT) {
        addRx('⚠ OVCURRENT', '')
      } else if (eventType === EVENT_THERMAL_WARNING) {
        addRx('🌡 THERMAL', '')
      }
    })
    return cleanup
  }, [isConnected])

  const addTxRef = useRef(onTransaction)
  addTxRef.current = onTransaction
  const addTx = useMemo(() => (s: string, d: string) =>
    addTxRef.current({ timestamp: Date.now(), direction: 'tx', protocol: 'GPIO', summary: s, data: d }), [])
  const addRxRef = useRef(onTransaction)
  addRxRef.current = onTransaction
  const addRx = useMemo(() => (s: string, d: string) =>
    addRxRef.current({ timestamp: Date.now(), direction: 'rx', protocol: 'GPIO', summary: s, data: d }), [])

  /* ── Config ─────────────────────────────────────── */
  const handleConfig = useCallback(async () => {
    if (!isConnected) return
    const modeName = mode.toUpperCase()
    addTx(`CFG Pin${pin} ${modeName} PULL=${pull}`, '')
    try {
      await window.deviceApi.sendCommand(
        CMD_GPIO_CFG,
        Array.from(new Uint8Array([pin, MODE_MAP[mode], PULL_MAP[pull]]))
      )
      recordStep('GPIO', 'config', { pin, mode: MODE_MAP[mode], pull: PULL_MAP[pull] })
      addRx('CFG OK', '')
    } catch (err: any) {
      addRx('CFG ERROR', err.message)
    }
  }, [isConnected, pin, mode, pull, addTx, addRx])

  /* ── Write ──────────────────────────────────────── */
  const handleWrite = useCallback(async (val: number) => {
    if (!isConnected) return
    addTx(`WRITE Pin${pin} → ${val}`, '')
    try {
      await window.deviceApi.sendCommand(CMD_GPIO_WRITE, Array.from(new Uint8Array([pin, val])))
      setOutputVal(val)
      recordStep('GPIO', 'write', { pin, value: val })
      addRx('WRITE OK', String(val))
    } catch (err: any) {
      addRx('WRITE ERROR', err.message)
    }
  }, [isConnected, pin, addTx, addRx])

  /* ── Read ───────────────────────────────────────── */
  const handleRead = useCallback(async () => {
    if (!isConnected) return
    try {
      const resp = await window.deviceApi.sendCommand(CMD_GPIO_READ, Array.from(new Uint8Array([pin])))
      const val = resp.payload.length > 0 ? resp.payload[0] : 0
      setReadVal(val)
      recordStep('GPIO', 'read', { pin })
      addRx(`READ Pin${pin}`, String(val))
    } catch (err: any) {
      addRx('READ ERROR', err.message)
    }
  }, [isConnected, pin, addRx])

  /* ── PWM ────────────────────────────────────────── */
  const handlePwm = useCallback(async () => {
    if (!isConnected) return
    addTx(`PWM Pin${pin} ${pwmFreq}Hz Duty=${(pwmDuty / 10).toFixed(1)}%`, '')
    try {
      const payload = new Uint8Array([
        pin,
        (pwmFreq >> 24) & 0xff, (pwmFreq >> 16) & 0xff, (pwmFreq >> 8) & 0xff, pwmFreq & 0xff,
        (pwmDuty >> 8) & 0xff, pwmDuty & 0xff,
      ])
      await window.deviceApi.sendCommand(CMD_GPIO_PWM, Array.from(payload))
      recordStep('GPIO', 'pwm', { pin, freq: pwmFreq, duty: pwmDuty })
      addRx('PWM OK', `${pwmFreq}Hz ${(pwmDuty / 10).toFixed(1)}%`)
    } catch (err: any) {
      addRx('PWM ERROR', err.message)
    }
  }, [isConnected, pin, pwmFreq, pwmDuty, addTx, addRx])

  return (
    <div className="protocol-panel">
      <div className="pp-header">
        <span className="pp-icon">🔌</span>
        <span className="pp-title">{t('gpio.title')}</span>
      </div>

      {/* Pin + Mode + Pull + Config */}
      <div className="pp-row">
        <div className="pp-field pp-field--sm">
          <label>Pin</label>
          <select value={pin} onChange={(e) => setPin(Number(e.target.value))}>
            {Array.from({ length: 8 }, (_, i) => <option key={i} value={i}>GPIO{i}</option>)}
          </select>
        </div>
        <div className="pp-field">
          <label>Mode</label>
          <select value={mode} onChange={(e) => setMode(e.target.value as GpioMode)}>
            <option value="in">Input</option>
            <option value="out">Output</option>
            <option value="pwm">PWM</option>
            <option value="freq">Freq</option>
          </select>
        </div>
        <div className="pp-field">
          <label>Pull</label>
          <select value={pull} onChange={(e) => setPull(e.target.value as GpioPull)}>
            <option value="none">None</option>
            <option value="up">Up</option>
            <option value="down">Down</option>
          </select>
        </div>
        <button className="pp-btn pp-btn--scan" onClick={handleConfig} disabled={!isConnected}>Apply</button>
      </div>

      {/* Output mode */}
      {mode === 'out' && (
        <div className="pp-row">
          <button className="pp-btn pp-btn--read" onClick={() => handleWrite(1)} disabled={!isConnected}>
            Set HIGH
          </button>
          <button className="pp-btn" onClick={() => handleWrite(0)} disabled={!isConnected}>
            Set LOW
          </button>
          {outputVal !== null && (
            <span className="pp-hint" style={{ alignSelf: 'center', fontSize: 12, color: outputVal ? 'var(--accent)' : 'var(--text-muted)' }}>
              {outputVal ? 'HIGH' : 'LOW'}
            </span>
          )}
        </div>
      )}

      {/* Input mode */}
      {mode === 'in' && (
        <>
          <div className="pp-row">
            <button className="pp-btn pp-btn--read" onClick={handleRead} disabled={!isConnected}>Read</button>
            <button
              className={`pp-btn ${monitoring ? 'pp-btn--active' : ''}`}
              onClick={toggleMonitor}
              disabled={!isConnected}
            >
              {monitoring ? '⏹ Stop' : '▶ Monitor'}
            </button>
            {readVal !== null && (
              <span className="pp-hint" style={{ alignSelf: 'center', fontSize: 12, color: readVal ? 'var(--accent)' : 'var(--text-muted)' }}>
                Value: {readVal}
              </span>
            )}
          </div>
          {events.length > 0 && (
            <div className="can-log" style={{ maxHeight: 120, overflow: 'auto', marginTop: 4 }}>
              {events.slice(-15).map((ev, i) => (
                <div key={i} className="can-log-line" style={{ fontSize: 10 }}>{ev}</div>
              ))}
            </div>
          )}
        </>
      )}

      {/* PWM mode */}
      {mode === 'pwm' && (
        <>
          <div className="pp-row">
            <div className="pp-field">
              <label>Freq (Hz)</label>
              <input type="number" value={pwmFreq} onChange={(e) => setPwmFreq(Math.max(1, Number(e.target.value)))} min={1} />
            </div>
            <div className="pp-field">
              <label>Duty (0-100%)</label>
              <input
                type="number"
                value={Math.round(pwmDuty / 10)}
                onChange={(e) => setPwmDuty(Math.min(1000, Math.max(0, Number(e.target.value) * 10)))}
                min={0} max={100}
              />
            </div>
            <button className="pp-btn pp-btn--write" onClick={handlePwm} disabled={!isConnected}>Set PWM</button>
          </div>
        </>
      )}
    </div>
  )
}
