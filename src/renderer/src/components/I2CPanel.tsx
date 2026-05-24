import { useState, useCallback, useRef, useEffect } from 'react'
import {
  CMD_I2C_SCAN,
  CMD_I2C_READ,
  CMD_I2C_WRITE,
  CMD_I2C_WRITE_READ,
  COMMAND_NAMES,
  ERROR_NAMES,
} from '../../../shared/commands'
import { useT } from '../i18n/I18nContext'
import { recordStep } from '../macro-recorder'

interface Props {
  isConnected: boolean
  onTransaction: (entry: {
    timestamp: number
    direction: 'tx' | 'rx'
    protocol: string
    summary: string
    data: string
  }) => void
}

const BAUD_RATES = [100_000, 400_000, 1_000_000]
const KNOWN_DEVICES: Record<number, string> = {
  0x68: 'MPU6050',
  0x76: 'BME280',
  0x77: 'BME280',
  0x3c: 'OLED(128x64)',
  0x50: 'EEPROM(24Cxx)',
  0x48: 'ADS1115',
  0x40: 'PCA9685',
  0x23: 'BH1750',
  0x5c: 'AM2320',
}

export default function I2CPanel({ isConnected, onTransaction }: Props) {
  const { t } = useT()
  const [channel, setChannel] = useState(0)
  const [speed, setSpeed] = useState(400_000)
  const [deviceAddr, setDeviceAddr] = useState('0x68')
  const [register, setRegister] = useState('0x00')
  const [readLen, setReadLen] = useState(8)
  const [writeData, setWriteData] = useState('')
  const [scanResults, setScanResults] = useState<number[]>([])
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState('')

  const parseHex = (s: string): number => {
    const cleaned = s.replace(/^0x/i, '')
    return parseInt(cleaned, 16)
  }

  const hex = (n: number, pad = 2): string =>
    '0x' + n.toString(16).toUpperCase().padStart(pad, '0')

  const addTx = (summary: string, data: string) => {
    onTransaction({ timestamp: Date.now(), direction: 'tx', protocol: 'I2C', summary, data })
  }

  const addRx = (summary: string, data: string) => {
    onTransaction({ timestamp: Date.now(), direction: 'rx', protocol: 'I2C', summary, data })
  }

  /* ── Scan Bus ────────────────────────────────────── */
  const handleScan = useCallback(async () => {
    if (!isConnected) return
    setBusy(true)
    setScanResults([])
    addTx(`SCAN Ch${channel} @ ${speed / 1000}kHz`, '')

    try {
      const payload = new Uint8Array([channel, speed === 100_000 ? 0 : speed === 400_000 ? 1 : 2])
      const resp = await window.deviceApi.sendCommand(CMD_I2C_SCAN, Array.from(payload))
      const addrs = Array.from(resp.payload)
      setScanResults(addrs)
      recordStep('I2C', 'scan', { channel, speed })
      addRx('SCAN OK', `${addrs.length} device(s): ${addrs.map(hex).join(' ')}`)
      setResult(`Found ${addrs.length} device(s): ${addrs.map(hex).join(', ')}`)
    } catch (err: any) {
      addRx('SCAN ERROR', err.message)
      setResult(`Scan error: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }, [isConnected, channel, speed, addTx, addRx])

  /* ── Read ────────────────────────────────────────── */
  const handleRead = useCallback(async () => {
    if (!isConnected) return
    setBusy(true)
    const addr = parseHex(deviceAddr)
    const reg = parseHex(register)
    addTx(`READ Ch${channel} ${hex(addr)} reg=${hex(reg)} len=${readLen}`, '')

    try {
      const payload = new Uint8Array([
        channel,
        addr,
        (reg >> 8) & 0xff,
        reg & 0xff,
        (readLen >> 8) & 0xff,
        readLen & 0xff,
      ])
      const resp = await window.deviceApi.sendCommand(CMD_I2C_READ, Array.from(payload))
      const hexData = Array.from(resp.payload)
        .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
        .join(' ')
      addRx('READ OK', hexData)
      recordStep('I2C', 'read', { channel, addr, reg, len: readLen })
      setResult(hexData)
    } catch (err: any) {
      addRx('READ ERROR', err.message)
      setResult(`Read error: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }, [isConnected, channel, deviceAddr, register, readLen, addTx, addRx])

  /* ── Write ───────────────────────────────────────── */
  const handleWrite = useCallback(async () => {
    if (!isConnected || !writeData.trim()) return
    setBusy(true)
    const addr = parseHex(deviceAddr)
    const reg = parseHex(register)
    const dataBytes = writeData
      .replace(/\s/g, '')
      .match(/.{1,2}/g)
      ?.map((b) => parseInt(b, 16)) ?? []

    if (dataBytes.length === 0) {
      setBusy(false)
      return
    }

    addTx(`WRITE Ch${channel} ${hex(addr)} reg=${hex(reg)}: ${writeData}`, '')

    try {
      const payload = new Uint8Array([channel, addr, (reg >> 8) & 0xff, reg & 0xff, ...dataBytes])
      await window.deviceApi.sendCommand(CMD_I2C_WRITE, Array.from(payload))
      addRx('WRITE OK', `${dataBytes.length} bytes written`)
      recordStep('I2C', 'write', { channel, addr, reg, data: dataBytes })
      setResult(`${dataBytes.length} bytes written`)
    } catch (err: any) {
      addRx('WRITE ERROR', err.message)
      setResult(`Write error: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }, [isConnected, channel, deviceAddr, register, writeData, addTx, addRx])

  return (
    <div className="protocol-panel">
      <div className="pp-header">
        <span className="pp-icon">🔌</span>
        <span className="pp-title">{t('i2c.title')}</span>
      </div>

      {/* Config Row */}
      <div className="pp-row">
        <div className="pp-field">
          <label>Channel</label>
          <select value={channel} onChange={(e) => setChannel(Number(e.target.value))}>
            {Array.from({ length: 8 }, (_, i) => (
              <option key={i} value={i}>Ch {i}</option>
            ))}
          </select>
        </div>
        <div className="pp-field">
          <label>Speed</label>
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
            {BAUD_RATES.map((r) => (
              <option key={r} value={r}>{r / 1000}kHz</option>
            ))}
          </select>
        </div>
        <button className="pp-btn pp-btn--scan" onClick={handleScan} disabled={busy || !isConnected}>
          {busy ? '…' : '🔍 Scan'}
        </button>
      </div>

      {/* Scan Results */}
      {scanResults.length > 0 && (
        <div className="pp-scan-results">
          {scanResults.map((addr) => (
            <button
              key={addr}
              className="pp-chip"
              onClick={() => setDeviceAddr(hex(addr))}
              title={KNOWN_DEVICES[addr] || `Device 0x${addr.toString(16).toUpperCase()}`}
            >
              {hex(addr)}
              {KNOWN_DEVICES[addr] && <span className="pp-chip-hint">{KNOWN_DEVICES[addr]}</span>}
            </button>
          ))}
        </div>
      )}

      {/* Device / Register / Length */}
      <div className="pp-row">
        <div className="pp-field">
          <label>Device</label>
          <input
            value={deviceAddr}
            onChange={(e) => setDeviceAddr(e.target.value)}
            placeholder="0x68"
            spellCheck={false}
          />
        </div>
        <div className="pp-field">
          <label>Register</label>
          <input
            value={register}
            onChange={(e) => setRegister(e.target.value)}
            placeholder="0x00"
            spellCheck={false}
          />
        </div>
        <div className="pp-field pp-field--sm">
          <label>Len</label>
          <input
            type="number"
            value={readLen}
            onChange={(e) => setReadLen(Math.max(1, Number(e.target.value)))}
            min={1}
            max={255}
          />
        </div>
        <button className="pp-btn pp-btn--read" onClick={handleRead} disabled={busy || !isConnected}>
          Read
        </button>
      </div>

      {/* Write Data + Button */}
      <div className="pp-row">
        <div className="pp-field pp-field--grow">
          <label>Write Data (hex)</label>
          <input
            value={writeData}
            onChange={(e) => setWriteData(e.target.value.replace(/[^0-9a-fA-F\s]/g, ''))}
            placeholder="00 00 00 00"
            spellCheck={false}
          />
        </div>
        <button
          className="pp-btn pp-btn--write"
          onClick={handleWrite}
          disabled={busy || !isConnected || !writeData.trim()}
        >
          Write
        </button>
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
