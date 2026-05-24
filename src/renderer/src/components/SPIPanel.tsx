import { useState, useCallback } from 'react'
import { CMD_SPI_TRANSFER, CMD_SPI_CS_CTRL } from '../../../shared/commands'

interface Props {
  isConnected: boolean
  onTransaction: (entry: {
    timestamp: number; direction: 'tx' | 'rx'; protocol: string
    summary: string; data: string
  }) => void
}

const SPI_MODES = [
  { value: 0, label: 'Mode 0 (CPOL=0,CPHA=0)' },
  { value: 1, label: 'Mode 1 (CPOL=0,CPHA=1)' },
  { value: 2, label: 'Mode 2 (CPOL=1,CPHA=0)' },
  { value: 3, label: 'Mode 3 (CPOL=1,CPHA=1)' },
]

const SPEEDS = [100, 250, 500, 1000, 2000, 5000, 10000, 20000, 50000]
// stored as kHz; sent as 100kHz units per spec

export default function SPIPanel({ isConnected, onTransaction }: Props) {
  const [bus, setBus] = useState(0)
  const [mode, setMode] = useState(0)
  const [speedKHz, setSpeedKHz] = useState(1000)
  const [cs, setCs] = useState(0)
  const [bitOrder, setBitOrder] = useState(0) // 0=MSB, 1=LSB
  const [txData, setTxData] = useState('')
  const [rxData, setRxData] = useState('')
  const [busy, setBusy] = useState(false)

  const addTx = (summary: string, data: string) =>
    onTransaction({ timestamp: Date.now(), direction: 'tx', protocol: 'SPI', summary, data })

  const addRx = (summary: string, data: string) =>
    onTransaction({ timestamp: Date.now(), direction: 'rx', protocol: 'SPI', summary, data })

  const parseHexBytes = (s: string): number[] =>
    s.replace(/\s/g, '').match(/.{1,2}/g)?.map((b) => parseInt(b, 16)) ?? []

  const handleTransfer = useCallback(async () => {
    if (!isConnected || !txData.trim()) return
    setBusy(true)
    const dataBytes = parseHexBytes(txData)
    if (dataBytes.length === 0) { setBusy(false); return }

    const speed100kHz = Math.max(1, Math.round(speedKHz / 100))
    addTx(
      `XFER Bus${bus} Mode${mode} ${speedKHz}kHz CS${cs} ${bitOrder ? 'LSB' : 'MSB'} len=${dataBytes.length}`,
      txData
    )

    try {
      const payload = new Uint8Array([
        bus, mode, speed100kHz, cs, bitOrder,
        (dataBytes.length >> 8) & 0xff, dataBytes.length & 0xff,
        ...dataBytes,
      ])
      const resp = await window.deviceApi.sendCommand(CMD_SPI_TRANSFER, Array.from(payload))
      const hexOut = Array.from(resp.payload)
        .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
        .join(' ')
      addRx('XFER OK', hexOut)
      setRxData(hexOut)
    } catch (err: any) {
      addRx('XFER ERROR', err.message)
      setRxData(`Error: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }, [isConnected, bus, mode, speedKHz, cs, bitOrder, txData, addTx, addRx])

  const handleCsCtrl = useCallback(async (state: number) => {
    if (!isConnected) return
    addTx(`CS Bus${bus} CS${cs} → ${state ? 'HIGH' : 'LOW'}`, '')
    try {
      await window.deviceApi.sendCommand(CMD_SPI_CS_CTRL, Array.from(new Uint8Array([bus, cs, state])))
      addRx('CS OK', state ? 'HIGH' : 'LOW')
    } catch (err: any) {
      addRx('CS ERROR', err.message)
    }
  }, [isConnected, bus, cs, addTx, addRx])

  return (
    <div className="protocol-panel">
      <div className="pp-header">
        <span className="pp-icon">⚡</span>
        <span className="pp-title">SPI</span>
      </div>

      {/* Config Row 1 */}
      <div className="pp-row">
        <div className="pp-field">
          <label>Bus</label>
          <select value={bus} onChange={(e) => setBus(Number(e.target.value))}>
            {[0, 1].map((i) => <option key={i} value={i}>SPI {i}</option>)}
          </select>
        </div>
        <div className="pp-field">
          <label>Mode</label>
          <select value={mode} onChange={(e) => setMode(Number(e.target.value))}>
            {SPI_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div className="pp-field">
          <label>Speed</label>
          <select value={speedKHz} onChange={(e) => setSpeedKHz(Number(e.target.value))}>
            {SPEEDS.map((s) => <option key={s} value={s}>{s >= 1000 ? `${s / 1000}MHz` : `${s}kHz`}</option>)}
          </select>
        </div>
        <div className="pp-field pp-field--sm">
          <label>CS</label>
          <select value={cs} onChange={(e) => setCs(Number(e.target.value))}>
            {[0, 1, 2, 3].map((i) => <option key={i} value={i}>CS{i}</option>)}
          </select>
        </div>
        <div className="pp-field pp-field--sm">
          <label>Order</label>
          <select value={bitOrder} onChange={(e) => setBitOrder(Number(e.target.value))}>
            <option value={0}>MSB</option>
            <option value={1}>LSB</option>
          </select>
        </div>
      </div>

      {/* CS Manual Control */}
      <div className="pp-row">
        <button className="pp-btn" onClick={() => handleCsCtrl(0)} disabled={!isConnected}>CS Low</button>
        <button className="pp-btn" onClick={() => handleCsCtrl(1)} disabled={!isConnected}>CS High</button>
      </div>

      {/* Transfer Data */}
      <div className="pp-row">
        <div className="pp-field pp-field--grow">
          <label>TX Data (hex)</label>
          <input
            value={txData}
            onChange={(e) => setTxData(e.target.value.replace(/[^0-9a-fA-F\s]/g, ''))}
            placeholder="A5 5A FF 00"
            spellCheck={false}
          />
        </div>
        <button className="pp-btn pp-btn--read" onClick={handleTransfer} disabled={busy || !isConnected || !txData.trim()}>
          Transfer
        </button>
      </div>

      {/* RX Result */}
      {rxData && (
        <div className="pp-result">
          <span className="pp-result-label">RX:</span>
          <code className="pp-result-data">{rxData}</code>
        </div>
      )}
    </div>
  )
}
