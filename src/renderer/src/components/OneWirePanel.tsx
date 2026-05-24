import { useState, useCallback } from 'react'
import { CMD_OW_RESET, CMD_OW_SEARCH, CMD_OW_READ, CMD_OW_WRITE } from '../../../shared/commands'
import { useT } from '../i18n/I18nContext'
import { recordStep } from '../macro-recorder'

interface Props {
  isConnected: boolean
  onTransaction: (entry: {
    timestamp: number; direction: 'tx' | 'rx'; protocol: string
    summary: string; data: string
  }) => void
}

export default function OneWirePanel({ isConnected, onTransaction }: Props) {
  const { t } = useT()
  const [rom, setRom] = useState('')
  const [owCmd, setOwCmd] = useState('')
  const [readLen, setReadLen] = useState(8)
  const [writeData, setWriteData] = useState('')
  const [result, setResult] = useState('')
  const [romList, setRomList] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [presence, setPresence] = useState<boolean | null>(null)

  const addTx = (s: string, d: string) =>
    onTransaction({ timestamp: Date.now(), direction: 'tx', protocol: '1W', summary: s, data: d })
  const addRx = (s: string, d: string) =>
    onTransaction({ timestamp: Date.now(), direction: 'rx', protocol: '1W', summary: s, data: d })

  const parseHex = (s: string): number => parseInt(s.replace(/^0x/i, ''), 16)

  const parseRom = (s: string): number[] =>
    s.replace(/[\s:]/g, '').match(/.{1,2}/g)?.map((b) => parseInt(b, 16)) ?? []

  const hexRom = (bytes: number[]): string =>
    bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(':')

  /* ── Reset ──────────────────────────────────────── */
  const handleReset = useCallback(async () => {
    if (!isConnected) return
    setBusy(true)
    setPresence(null)
    addTx('RESET', '')
    try {
      const resp = await window.deviceApi.sendCommand(CMD_OW_RESET, [])
      const hasDevice = resp.payload.length > 0 && resp.payload[0] === 1
      setPresence(hasDevice)
      recordStep('1W', 'reset', {})
      addRx(hasDevice ? 'PRESENCE detected' : 'NO DEVICE', '')
      setResult(hasDevice ? 'Device present ✓' : 'No device on bus')
    } catch (err: any) {
      addRx('RESET ERROR', err.message)
      setResult(`Error: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }, [isConnected, addTx, addRx])

  /* ── Search ─────────────────────────────────────── */
  const handleSearch = useCallback(async () => {
    if (!isConnected) return
    setBusy(true)
    setRomList([])
    addTx('SEARCH ROM', '')
    try {
      const resp = await window.deviceApi.sendCommand(CMD_OW_SEARCH, [])
      const roms: string[] = []
      for (let i = 0; i + 7 < resp.payload.length; i += 8) {
        const romBytes = Array.from(resp.payload.slice(i, i + 8))
        roms.push(hexRom(romBytes))
      }
      setRomList(roms)
      recordStep('1W', 'search', {})
      addRx('SEARCH OK', `${roms.length} device(s)`)
      setResult(`Found ${roms.length} device(s)`)
    } catch (err: any) {
      addRx('SEARCH ERROR', err.message)
      setResult(`Error: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }, [isConnected, addTx, addRx])

  /* ── Read ───────────────────────────────────────── */
  const handleRead = useCallback(async () => {
    if (!isConnected) return
    setBusy(true)
    const romBytes = parseRom(rom)
    const cmd = parseHex(owCmd)
    if (romBytes.length !== 8) { setBusy(false); setResult('Need 8-byte ROM'); return }
    addTx(`READ ROM=${hexRom(romBytes)} CMD=${owCmd} len=${readLen}`, '')
    try {
      const payload = new Uint8Array([
        ...romBytes, cmd, (readLen >> 8) & 0xff, readLen & 0xff,
      ])
      const resp = await window.deviceApi.sendCommand(CMD_OW_READ, Array.from(payload))
      const hexOut = Array.from(resp.payload)
        .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
        .join(' ')
      addRx('READ OK', hexOut)
      recordStep('1W', 'read', { rom: romBytes, cmd: parseHex(owCmd), len: readLen })
      setResult(hexOut)
    } catch (err: any) {
      addRx('READ ERROR', err.message)
      setResult(`Error: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }, [isConnected, rom, owCmd, readLen, addTx, addRx])

  /* ── Write ──────────────────────────────────────── */
  const handleWrite = useCallback(async () => {
    if (!isConnected || !writeData.trim()) return
    setBusy(true)
    const romBytes = parseRom(rom)
    const dataBytes = writeData.replace(/\s/g, '').match(/.{1,2}/g)?.map((b) => parseInt(b, 16)) ?? []
    if (romBytes.length !== 8 || dataBytes.length === 0) { setBusy(false); return }
    addTx(`WRITE ROM=${hexRom(romBytes)} ${writeData}`, '')
    try {
      await window.deviceApi.sendCommand(CMD_OW_WRITE, Array.from(new Uint8Array([...romBytes, ...dataBytes])))
      addRx('WRITE OK', `${dataBytes.length} bytes`)
      recordStep('1W', 'write', { rom: romBytes, data: dataBytes })
      setResult(`${dataBytes.length} bytes written`)
    } catch (err: any) {
      addRx('WRITE ERROR', err.message)
      setResult(`Error: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }, [isConnected, rom, writeData, addTx, addRx])

  return (
    <div className="protocol-panel">
      <div className="pp-header">
        <span className="pp-icon">🌡</span>
        <span className="pp-title">{t('ow.title')}</span>
      </div>

      {/* Reset + Search */}
      <div className="pp-row">
        <button className="pp-btn pp-btn--scan" onClick={handleReset} disabled={busy || !isConnected}>Reset</button>
        <button className="pp-btn pp-btn--scan" onClick={handleSearch} disabled={busy || !isConnected}>Search ROM</button>
        {presence !== null && (
          <span className="pp-hint" style={{ alignSelf: 'center', fontSize: 12, color: presence ? 'var(--accent)' : 'var(--error)' }}>
            {presence ? '✓ Present' : '✗ No device'}
          </span>
        )}
      </div>

      {/* ROM List */}
      {romList.length > 0 && (
        <div className="pp-scan-results">
          {romList.map((r) => (
            <button key={r} className="pp-chip" onClick={() => setRom(r)}>
              {r}
            </button>
          ))}
        </div>
      )}

      {/* ROM + Command */}
      <div className="pp-row">
        <div className="pp-field pp-field--grow">
          <label>ROM (8 bytes)</label>
          <input value={rom} onChange={(e) => setRom(e.target.value)} placeholder="28:AA:BB:CC:DD:EE:FF:00" spellCheck={false} />
        </div>
        <div className="pp-field pp-field--sm">
          <label>CMD</label>
          <input value={owCmd} onChange={(e) => setOwCmd(e.target.value.replace(/[^0-9a-fA-F]/g, ''))} placeholder="BE" spellCheck={false} maxLength={2} />
        </div>
        <div className="pp-field pp-field--sm">
          <label>Len</label>
          <input type="number" value={readLen} onChange={(e) => setReadLen(Math.max(1, Number(e.target.value)))} min={1} max={255} />
        </div>
        <button className="pp-btn pp-btn--read" onClick={handleRead} disabled={busy || !isConnected}>Read</button>
      </div>

      {/* Write */}
      <div className="pp-row">
        <div className="pp-field pp-field--grow">
          <label>Write Data (hex)</label>
          <input value={writeData} onChange={(e) => setWriteData(e.target.value.replace(/[^0-9a-fA-F\s]/g, ''))} placeholder="44" spellCheck={false} />
        </div>
        <button className="pp-btn pp-btn--write" onClick={handleWrite} disabled={busy || !isConnected || !writeData.trim()}>Write</button>
      </div>

      {/* Result */}
      {result && (
        <div className="pp-result">
          <span className="pp-result-label">Result:</span>
          <code className="pp-result-data">{result}</code>
        </div>
      )}
    </div>
  )
}
