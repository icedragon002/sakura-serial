import { useState, useCallback, useEffect, useRef } from 'react'
import { CMD_LA_CFG, CMD_LA_START, CMD_LA_STOP, CMD_LA_STATUS, CMD_LA_STREAM_MODE, CMD_LA_DATA } from '../../../shared/commands'
import { useT } from '../i18n/I18nContext'
import WaveformViewer, { type WaveformChannel } from './WaveformViewer'
import { recordStep } from '../macro-recorder'

interface Props {
  isConnected: boolean
  onTransaction: (entry: {
    timestamp: number; direction: 'tx' | 'rx'; protocol: string
    summary: string; data: string
  }) => void
}

const SAMPLE_RATES = [1, 10, 50, 100, 250, 500, 1000, 5000, 10000, 25000, 50000, 100000]
const VREFS = [
  { value: 0, label: '1.8V' },
  { value: 1, label: '3.3V' },
  { value: 2, label: '5V' },
]

type LaStatus = 'idle' | 'armed' | 'triggered' | 'done'

export default function LAPanel({ isConnected, onTransaction }: Props) {
  const { t } = useT()
  const [channels, setChannels] = useState(0xff) // bitmask
  const [sampleRateKHz, setSampleRateKHz] = useState(1000)
  const [vref, setVref] = useState(1) // 3.3V
  const [triggerMask, setTriggerMask] = useState(0)
  const [triggerVal, setTriggerVal] = useState(0)
  const [triggerEdge, setTriggerEdge] = useState<'rising' | 'falling' | 'both'>('rising')
  const [preSamples, setPreSamples] = useState(4096)
  const [postSamples, setPostSamples] = useState(4096)
  const [streamMode, setStreamMode] = useState(0)
  const [status, setStatus] = useState<LaStatus>('idle')
  const [busy, setBusy] = useState(false)
  const [capturedChannels, setCapturedChannels] = useState<WaveformChannel[]>([])
  const [triggerSample, setTriggerSample] = useState<number | undefined>()
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const addTx = (s: string, d: string) =>
    onTransaction({ timestamp: Date.now(), direction: 'tx', protocol: 'LA', summary: s, data: d })
  const addRx = (s: string, d: string) =>
    onTransaction({ timestamp: Date.now(), direction: 'rx', protocol: 'LA', summary: s, data: d })

  /* ── Config ─────────────────────────────────────── */
  const handleConfig = useCallback(async () => {
    if (!isConnected) return
    setBusy(true)
    // Compute trigger val from edge selection
    let tVal = triggerVal
    if (triggerEdge === 'rising') tVal = triggerMask
    else if (triggerEdge === 'falling') tVal = 0
    // 'both' uses triggerVal as-is for custom edge detection
    const chCount = [0, 1, 2, 3, 4, 5, 6, 7].filter((i) => channels & (1 << i)).length
    addTx(`CFG ${chCount}ch ${sampleRateKHz}kHz ${triggerEdge} trigger=${triggerMask.toString(16)}`, '')
    try {
      const payload = new Uint8Array([
        channels,
        (sampleRateKHz >> 24) & 0xff, (sampleRateKHz >> 16) & 0xff, (sampleRateKHz >> 8) & 0xff, sampleRateKHz & 0xff,
        triggerMask, tVal,
        (preSamples >> 24) & 0xff, (preSamples >> 16) & 0xff, (preSamples >> 8) & 0xff, preSamples & 0xff,
        (postSamples >> 24) & 0xff, (postSamples >> 16) & 0xff, (postSamples >> 8) & 0xff, postSamples & 0xff,
        vref,
      ])
      await window.deviceApi.sendCommand(CMD_LA_CFG, Array.from(payload))
      addRx('CFG OK', '')
      setStatus('armed')
      recordStep('LA', 'config', { channels, rate: sampleRateKHz })
    } catch (err: any) {
      addRx('CFG ERROR', err.message)
    } finally {
      setBusy(false)
    }
  }, [isConnected, channels, sampleRateKHz, vref, triggerMask, triggerVal, preSamples, postSamples, addTx, addRx])

  /* ── Start / Stop ───────────────────────────────── */
  const handleStart = useCallback(async () => {
    if (!isConnected) return
    addTx('START', '')
    try {
      await window.deviceApi.sendCommand(CMD_LA_START, [])
      setStatus('triggered')
      recordStep('LA', 'start', {})
      addRx('SAMPLING', '')
      // Poll for completion
      if (pollRef.current) clearInterval(pollRef.current)
      const poll = setInterval(async () => {
        try {
          const resp = await window.deviceApi.sendCommand(CMD_LA_STATUS, [])
          const s = resp.payload.length > 0 ? resp.payload[0] : 0
          if (s === 3) { clearInterval(poll); pollRef.current = null; setStatus('done') }
        } catch { clearInterval(poll); pollRef.current = null }
      }, 500)
      pollRef.current = poll
    } catch (err: any) {
      addRx('START ERROR', err.message)
    }
  }, [isConnected, addTx, addRx])

  const handleStop = useCallback(async () => {
    if (!isConnected) return
    addTx('STOP', '')
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    try {
      await window.deviceApi.sendCommand(CMD_LA_STOP, [])
      setStatus('done')
      addRx('STOPPED', '')

      // Fetch captured data
      try {
        const dataResp = await window.deviceApi.sendCommand(CMD_LA_DATA, [])
        if (dataResp.payload.length > 0) {
          // Payload format: [channelCount(1B)] [samplesPerChannel(2B)]
          //   [ch0_b0, ch0_b1, ...] [ch1_b0, ...]
          const view = new DataView(
            new Uint8Array(dataResp.payload).buffer
          )
          let off = 0
          const chCount = view.getUint8(off++)
          const samplesPerCh =
            (view.getUint8(off) << 8) | view.getUint8(off + 1)
          off += 2
          const chColors = ['#ff6b9d', '#4fc3f7', '#81c784', '#ffd54f', '#ce93d8', '#ff8a65', '#90caf9', '#a1887f']
          const activeChs = [0, 1, 2, 3, 4, 5, 6, 7].filter((i) => channels & (1 << i))
          const chData: WaveformChannel[] = []
          for (let ci = 0; ci < Math.min(chCount, activeChs.length); ci++) {
            const ch = activeChs[ci]
            const samples = new Uint8Array(samplesPerCh)
            for (let s = 0; s < samplesPerCh && off < dataResp.payload.length; s++) {
              samples[s] = dataResp.payload[off++] || 0
            }
            chData.push({ label: `CH${ch}`, data: samples, color: chColors[ch % chColors.length] })
          }
          setCapturedChannels(chData)
          setTriggerSample(Math.floor(samplesPerCh / 4)) // approximate trigger at 25%
          addRx(`DATA ${chData.length}ch × ${samplesPerCh}`, '')
          recordStep('LA', 'start', {})
        }
      } catch {
        addRx('Data fetch unavailable', '')
      }
    } catch (err: any) {
      addRx('STOP ERROR', err.message)
    }
  }, [isConnected, channels, addTx, addRx])

  /* ── Status ─────────────────────────────────────── */
  const handleStatus = useCallback(async () => {
    if (!isConnected) return
    try {
      const resp = await window.deviceApi.sendCommand(CMD_LA_STATUS, [])
      const s = resp.payload.length > 0 ? resp.payload[0] : 0
      const map: LaStatus[] = ['idle', 'armed', 'triggered', 'done']
      setStatus(map[s] ?? 'idle')
      addRx(`STATUS ${map[s] ?? 'idle'}`, '')
    } catch (err: any) {
      addRx('STATUS ERROR', err.message)
    }
  }, [isConnected, addRx])

  /* ── Stream Mode ────────────────────────────────── */
  const handleStreamMode = useCallback(async (m: number) => {
    if (!isConnected) return
    addTx(`STREAM_MODE ${m ? 'Stream' : 'Buffer'}`, '')
    try {
      await window.deviceApi.sendCommand(CMD_LA_STREAM_MODE, [m])
      setStreamMode(m)
      addRx('OK', m ? 'Stream' : 'Buffer')
    } catch (err: any) {
      addRx('STREAM_MODE ERROR', err.message)
    }
  }, [isConnected, addTx, addRx])

  const toggleChannel = (ch: number) => {
    setChannels((prev) => prev ^ (1 << ch))
  }

  return (
    <div className="protocol-panel">
      <div className="pp-header">
        <span className="pp-icon">📊</span>
        <span className="pp-title">{t('la.title')}</span>
      </div>

      {/* Channel Selection */}
      <div className="pp-field">
        <label>Channels</label>
        <div className="pp-row">
          {Array.from({ length: 8 }, (_, i) => (
            <button
              key={i}
              className={`pp-chip ${channels & (1 << i) ? 'pp-chip--active' : ''}`}
              onClick={() => toggleChannel(i)}
              style={channels & (1 << i) ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : {}}
            >
              CH{i}
            </button>
          ))}
        </div>
      </div>

      {/* Config */}
      <div className="pp-row">
        <div className="pp-field">
          <label>Sample Rate</label>
          <select value={sampleRateKHz} onChange={(e) => setSampleRateKHz(Number(e.target.value))}>
            {SAMPLE_RATES.map((r) => <option key={r} value={r}>{r >= 1000 ? `${r / 1000}MHz` : `${r}kHz`}</option>)}
          </select>
        </div>
        <div className="pp-field pp-field--sm">
          <label>VRef</label>
          <select value={vref} onChange={(e) => setVref(Number(e.target.value))}>
            {VREFS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
          </select>
        </div>
        <div className="pp-field">
          <label>Edge</label>
          <select value={triggerEdge} onChange={(e) => setTriggerEdge(e.target.value as 'rising' | 'falling' | 'both')}>
            <option value="rising">↑ Rising</option>
            <option value="falling">↓ Falling</option>
            <option value="both">↕ Both</option>
          </select>
        </div>
        <div className="pp-field pp-field--sm">
          <label>Mask</label>
          <input
            type="text"
            value={'0x' + triggerMask.toString(16).toUpperCase().padStart(2, '0')}
            onChange={(e) => setTriggerMask(parseInt(e.target.value.replace(/^0x/i, ''), 16) || 0)}
            spellCheck={false}
          />
        </div>
      </div>

      <div className="pp-row">
        <div className="pp-field">
          <label>Pre Samples</label>
          <input type="number" value={preSamples} onChange={(e) => setPreSamples(Number(e.target.value))} min={0} />
        </div>
        <div className="pp-field">
          <label>Post Samples</label>
          <input type="number" value={postSamples} onChange={(e) => setPostSamples(Number(e.target.value))} min={0} />
        </div>
        <button className="pp-btn pp-btn--scan" onClick={handleConfig} disabled={busy || !isConnected}>Apply Config</button>
      </div>

      {/* Mode Toggle */}
      <div className="pp-row">
        <button className={`pp-opt ${streamMode === 0 ? 'pp-opt--active' : ''}`} onClick={() => handleStreamMode(0)} disabled={!isConnected}>
          Buffer
        </button>
        <button className={`pp-opt ${streamMode === 1 ? 'pp-opt--active' : ''}`} onClick={() => handleStreamMode(1)} disabled={!isConnected}>
          Stream
        </button>
      </div>

      {/* Controls */}
      <div className="pp-row">
        <button className="pp-btn pp-btn--read" onClick={handleStart} disabled={!isConnected}>▶ Start</button>
        <button className="pp-btn" onClick={handleStop} disabled={!isConnected}>⏹ Stop</button>
        <button className="pp-btn" onClick={handleStatus} disabled={!isConnected}>Status</button>
        <span className="pp-hint" style={{ alignSelf: 'center', fontSize: 12, color: 'var(--text-dim)' }}>
          Status: <strong style={{ color: status === 'triggered' ? 'var(--accent)' : status === 'armed' ? 'var(--warning)' : 'var(--text-muted)' }}>
            {status.toUpperCase()}
          </strong>
        </span>
      </div>

      {/* Waveform Viewer */}
      {capturedChannels.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <WaveformViewer
            channels={capturedChannels}
            sampleRateKHz={sampleRateKHz}
            triggerSample={triggerSample}
          />
        </div>
      )}

      {/* Note */}
      {capturedChannels.length === 0 && (
        <div className="pp-placeholder" style={{ padding: '20px', textAlign: 'left' }}>
          <p>{t('la.noData')}</p>
          <p style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
            {t('la.streamHint')}
          </p>
        </div>
      )}
    </div>
  )
}
