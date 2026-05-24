import { useState, useCallback, useEffect, useRef } from 'react'

interface Props {
  isConnected: boolean
  onTransaction: (entry: {
    timestamp: number; direction: 'tx' | 'rx'; protocol: string
    summary: string; data: string
  }) => void
}

interface BleGattService {
  uuid: string
  characteristics: BleGattChar[]
}

interface BleGattChar {
  uuid: string
  properties: string[]
  value?: number[]
}

interface BleDeviceInfo {
  id: string
  name: string
  address: string
  rssi: number
  connectable: boolean
}

export default function BLEPanel({ onTransaction }: Props) {
  const [scanning, setScanning] = useState(false)
  const [devices, setDevices] = useState<BleDeviceInfo[]>([])
  const [connected, setConnected] = useState(false)
  const [services, setServices] = useState<BleGattService[]>([])
  const [selectedService, setSelectedService] = useState<string>('')
  const [selectedChar, setSelectedChar] = useState<string>('')
  const [charValue, setCharValue] = useState('')
  const [notifyLog, setNotifyLog] = useState<string[]>([])
  const [rssi, setRssi] = useState<number | null>(null)
  const notifySubs = useRef<Set<string>>(new Set())

  const addTx = (s: string, d: string) =>
    onTransaction({ timestamp: Date.now(), direction: 'tx', protocol: 'BLE', summary: s, data: d })
  const addRx = (s: string, d: string) =>
    onTransaction({ timestamp: Date.now(), direction: 'rx', protocol: 'BLE', summary: s, data: d })

  const shortUuid = (uuid: string) => {
    const m = uuid.match(/^0000([0-9a-f]{4})-0000-1000-8000-00805f9b34fb$/i)
    return m ? '0x' + m[1].toUpperCase() : uuid.length > 10 ? uuid.slice(0, 8) + '…' : uuid
  }

  const propIcons: Record<string, string> = {
    read: '📖', write: '✍', writeWithoutResponse: '⚡',
    notify: '🔔', indicate: '📢',
  }

  /* ── Scan ── */
  const handleScan = useCallback(async () => {
    setScanning(true)
    setDevices([])
    addTx('BLE Scan (native)', '')

    const cleanup = window.deviceApi.onBleDeviceFound((d) => {
      setDevices((prev) => {
        if (prev.find((p) => p.id === d.id)) return prev
        return [...prev, d]
      })
    })

    try {
      const found = await window.deviceApi.bleScan(5000)
      setDevices(found)
      addRx(`Found ${found.length} device(s)`, '')
    } catch (err: any) {
      addRx('Scan error: ' + err.message, '')
    } finally {
      cleanup()
      setScanning(false)
    }
  }, [addTx, addRx])

  /* ── Connect ── */
  const handleConnect = useCallback(async (device: BleDeviceInfo) => {
    addTx(`Connect: ${device.name} (${device.address})`, '')
    try {
      await window.deviceApi.bleConnect(device.id)
      setConnected(true)
      addRx('Connected', '')

      try {
        const r = await window.deviceApi.bleRssi()
        setRssi(r)
      } catch { /* RSSI read may fail */ }

      const svcs = await window.deviceApi.bleGetServices()
      setServices(svcs)
      addRx(`${svcs.length} services found`, '')
    } catch (err: any) {
      addRx('Connect error: ' + err.message, '')
    }
  }, [addTx, addRx])

  /* ── Disconnect ── */
  const handleDisconnect = useCallback(async () => {
    try {
      // Unsubscribe all
      for (const key of notifySubs.current) {
        const [svc, ch] = key.split('::')
        await window.deviceApi.bleUnsubscribe(svc, ch).catch(() => {})
      }
      notifySubs.current.clear()
      await window.deviceApi.bleDisconnect()
    } catch { /* ignore */ }
    setConnected(false)
    setServices([])
    setNotifyLog([])
    setRssi(null)
    addTx('Disconnected', '')
  }, [addTx])

  /* ── Notify listener ── */
  useEffect(() => {
    const cleanup = window.deviceApi.onBleNotify((svcUuid, charUuid, data) => {
      const hex = data.map((b) => b.toString(16).padStart(2, '0')).join(' ')
      const ts = new Date().toLocaleTimeString('en-US', { hour12: false })
      setNotifyLog((prev) => {
        const next = [...prev, `${ts} ${shortUuid(charUuid)}: ${hex}`]
        return next.length > 50 ? next.slice(-50) : next
      })
      addRx(`Notify ${shortUuid(charUuid)}`, hex)
    })
    return cleanup
  }, [addRx])

  /* ── GATT operations ── */
  const handleRead = useCallback(async (svcUuid: string, charUuid: string) => {
    try {
      const data = await window.deviceApi.bleReadChar(svcUuid, charUuid)
      const hex = data.map((b) => b.toString(16).padStart(2, '0')).join(' ')
      addTx(`Read ${shortUuid(charUuid)}`, '')
      addRx(`Value: ${hex}`, '')
      setServices((prev) => prev.map((s) =>
        s.uuid === svcUuid ? {
          ...s, characteristics: s.characteristics.map((c) =>
            c.uuid === charUuid ? { ...c, value: data } : c)
        } : s
      ))
    } catch (err: any) { addRx('Read error: ' + err.message, '') }
  }, [addTx, addRx])

  const handleWrite = useCallback(async (svcUuid: string, charUuid: string, val: string) => {
    if (!val.trim()) return
    const bytes = val.replace(/\s/g, '').match(/.{1,2}/g)?.map((b) => parseInt(b, 16)) ?? []
    if (bytes.length === 0) return
    try {
      addTx(`Write ${shortUuid(charUuid)}: ${val}`, '')
      await window.deviceApi.bleWriteChar(svcUuid, charUuid, bytes)
      addRx('Write OK', `${bytes.length} bytes`)
    } catch (err: any) { addRx('Write error: ' + err.message, '') }
  }, [addTx, addRx])

  const handleToggleNotify = useCallback(async (svcUuid: string, charUuid: string) => {
    const key = `${svcUuid}::${charUuid}`
    try {
      if (notifySubs.current.has(key)) {
        await window.deviceApi.bleUnsubscribe(svcUuid, charUuid)
        notifySubs.current.delete(key)
        addTx(`Unsubscribe ${shortUuid(charUuid)}`, '')
        addRx('Notifications stopped', '')
      } else {
        await window.deviceApi.bleSubscribe(svcUuid, charUuid)
        notifySubs.current.add(key)
        addTx(`Subscribe ${shortUuid(charUuid)}`, '')
        addRx('Notifications started', '')
      }
    } catch (err: any) { addRx('Subscribe error: ' + err.message, '') }
  }, [addTx, addRx])

  return (
    <div className="protocol-panel">
      <div className="pp-header">
        <span className="pp-icon">📶</span>
        <span className="pp-title">BLE Explorer</span>
      </div>

      {/* Scan */}
      <div className="pp-row">
        <button className="pp-btn pp-btn--scan" onClick={handleScan} disabled={scanning}>
          {scanning ? 'Scanning…' : '📡 Scan'}
        </button>
        {connected && (
          <button className="pp-btn" onClick={handleDisconnect}>Disconnect</button>
        )}
        <span className="pp-hint" style={{ alignSelf: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
          {connected ? `Connected ${rssi !== null ? `(RSSI: ${rssi}dBm)` : ''}` : 'Native BLE — no browser picker'}
        </span>
      </div>

      {/* Device list */}
      {!connected && devices.length > 0 && (
        <div className="pp-field pp-field--grow">
          <label>Devices ({devices.length})</label>
          <div style={{ maxHeight: 300, overflow: 'auto', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
            {devices.map((d) => (
              <button
                key={d.id}
                className="pp-chip"
                onClick={() => handleConnect(d)}
                style={{ display: 'block', width: '100%', textAlign: 'left', borderRadius: 0, border: 'none', borderBottom: '1px solid var(--border-color)', padding: '6px 10px' }}
              >
                <strong>{d.name || 'Unknown'}</strong>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 8 }}>
                  RSSI: {d.rssi}dBm · {d.address}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* GATT Services */}
      {services.length > 0 && (
        <div className="pp-field pp-field--grow">
          <label>GATT Services ({services.length})</label>
          <div style={{ maxHeight: 300, overflow: 'auto', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
            {services.map((svc) => (
              <div key={svc.uuid}>
                <button
                  className="pp-chip"
                  onClick={() => setSelectedService(selectedService === svc.uuid ? '' : svc.uuid)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', borderRadius: 0, border: 'none', borderBottom: '1px solid var(--border-color)' }}
                >
                  <strong>{shortUuid(svc.uuid)}</strong>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 8 }}>
                    ({svc.characteristics.length} chars)
                  </span>
                </button>

                {selectedService === svc.uuid && (
                  <div style={{ padding: '4px 8px', background: 'var(--bg-card)' }}>
                    {svc.characteristics.map((ch) => (
                      <div key={ch.uuid} style={{ padding: '4px 0', borderBottom: '1px solid var(--border-color)', fontSize: 11 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>
                            {shortUuid(ch.uuid)}
                          </span>
                          {ch.properties.map((p) => (
                            <span key={p} title={p} style={{ fontSize: 10 }}>{propIcons[p] || p}</span>
                          ))}
                        </div>

                        {ch.value && (
                          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 4 }}>
                            Value: {ch.value.map((b) => b.toString(16).padStart(2, '0')).join(' ')}
                          </div>
                        )}

                        <div style={{ display: 'flex', gap: 4 }}>
                          {ch.properties.includes('read') && (
                            <button className="log-toolbar__btn" onClick={() => handleRead(svc.uuid, ch.uuid)}
                              style={{ fontSize: 10, padding: '1px 6px' }}>R</button>
                          )}
                          {(ch.properties.includes('write') || ch.properties.includes('writeWithoutResponse')) && (
                            <>
                              <input
                                value={selectedChar === ch.uuid ? charValue : ''}
                                onFocus={() => { setSelectedChar(ch.uuid); setCharValue('') }}
                                onChange={(e) => setCharValue(e.target.value.replace(/[^0-9a-fA-F\s]/g, ''))}
                                placeholder="hex"
                                style={{ width: 80, fontSize: 10, padding: '1px 4px', fontFamily: 'var(--font-mono)' }}
                                spellCheck={false}
                              />
                              <button className="log-toolbar__btn" onClick={() => handleWrite(svc.uuid, ch.uuid, charValue)}
                                style={{ fontSize: 10, padding: '1px 6px' }}>W</button>
                            </>
                          )}
                          {(ch.properties.includes('notify') || ch.properties.includes('indicate')) && (
                            <button
                              className={`log-toolbar__btn ${notifySubs.current.has(`${svc.uuid}::${ch.uuid}`) ? 'log-toolbar__btn--active' : ''}`}
                              onClick={() => handleToggleNotify(svc.uuid, ch.uuid)}
                              style={{ fontSize: 10, padding: '1px 6px' }}
                            >
                              {notifySubs.current.has(`${svc.uuid}::${ch.uuid}`) ? '⏹ N' : '▶ N'}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notification Log */}
      {notifyLog.length > 0 && (
        <div className="pp-field pp-field--grow">
          <label>Notification Log ({notifyLog.length})</label>
          <div className="can-log" style={{ maxHeight: 150, overflow: 'auto', fontSize: 10, fontFamily: 'var(--font-mono)' }}>
            {notifyLog.slice(-20).map((line, i) => (
              <div key={i} className="can-log-line">{line}</div>
            ))}
          </div>
          <button className="pp-btn" onClick={() => setNotifyLog([])} style={{ marginTop: 4, fontSize: 10 }}>Clear</button>
        </div>
      )}

      {!connected && devices.length === 0 && (
        <div className="pp-placeholder">
          Click 📡 Scan to search for BLE devices via native Bluetooth.
        </div>
      )}
    </div>
  )
}
