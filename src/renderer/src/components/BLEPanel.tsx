import { useState, useCallback, useEffect, useRef } from 'react'
import { useT } from '../i18n/I18nContext'

interface Props {
  isConnected: boolean
  onTransaction: (entry: {
    timestamp: number; direction: 'tx' | 'rx'; protocol: string
    summary: string; data: string
  }) => void
}

interface BLEService {
  uuid: string
  characteristics: BLEChar[]
}

interface BLEChar {
  uuid: string
  properties: string[]
  value?: Uint8Array
  descriptor?: string
}

export default function BLEPanel({ onTransaction }: Props) {
  const { t } = useT()
  const [bleDevice, setBleDevice] = useState<BluetoothDevice | null>(null)
  const [bleServer, setBleServer] = useState<BluetoothRemoteGATTServer | null>(null)
  const [services, setServices] = useState<BLEService[]>([])
  const [scanning, setScanning] = useState(false)
  const [selectedService, setSelectedService] = useState<string>('')
  const [selectedChar, setSelectedChar] = useState<string>('')
  const [charValue, setCharValue] = useState('')
  const [notifyLog, setNotifyLog] = useState<string[]>([])
  const [rssi, setRssi] = useState<number | null>(null)
  const notifyRef = useRef<Map<string, BluetoothRemoteGATTCharacteristic>>(new Map())

  const addTx = (s: string, d: string) =>
    onTransaction({ timestamp: Date.now(), direction: 'tx', protocol: 'BLE', summary: s, data: d })
  const addRx = (s: string, d: string) =>
    onTransaction({ timestamp: Date.now(), direction: 'rx', protocol: 'BLE', summary: s, data: d })

  /* ── Hex helpers ── */
  const shortUuid = (uuid: string) => {
    const base = '0000xxxx-0000-1000-8000-00805f9b34fb'
    if (uuid.length === 4) return '0x' + uuid.toUpperCase()
    const m = uuid.match(/^0000([0-9a-f]{4})-0000-1000-8000-00805f9b34fb$/i)
    return m ? '0x' + m[1].toUpperCase() : uuid.slice(0, 8) + '…'
  }

  const propIcons: Record<string, string> = {
    read: '📖', write: '✍', writeWithoutResponse: '⚡',
    notify: '🔔', indicate: '📢', broadcast: '📡',
  }

  /* ── Scan ── */
  const handleScan = useCallback(async () => {
    if (!(navigator as any).bluetooth) {
      addRx('Web Bluetooth not available', '')
      return
    }
    setScanning(true)
    addTx('BLE Scan', '')
    try {
      const device = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['generic_access', 'device_information', 'battery_service',
          '0000180a-0000-1000-8000-00805f9b34fb',
          '6e400001-b5a3-f393-e0a9-e50e24dcca9e'],
      }) as BluetoothDevice
      setBleDevice(device)
      addRx(`Found: ${device.name || 'Unknown'}`, device.id)
      device.addEventListener('gattserverdisconnected', () => {
        setBleDevice(null); setBleServer(null); setServices([])
        addRx('Disconnected', '')
      })
    } catch (err: any) {
      if (err.message !== 'User cancelled') {
        addRx('Scan error: ' + err.message, '')
      }
    } finally {
      setScanning(false)
    }
  }, [addTx, addRx])

  /* ── Connect ── */
  const handleConnect = useCallback(async () => {
    if (!bleDevice) return
    addTx(`Connect: ${bleDevice.name || 'Unknown'}`, '')
    try {
      const server = await bleDevice.gatt!.connect()
      setBleServer(server)
      addRx('Connected', '')

      // Read RSSI if available
      try {
        const rssiVal = await (bleDevice as any).readRSSI?.()
        setRssi(rssiVal)
      } catch { /* RSSI not always supported */ }

      // Get all services
      const svcs = await server.getPrimaryServices()
      const svcList: BLEService[] = []
      for (const svc of svcs) {
        const chars = await svc.getCharacteristics()
        svcList.push({
          uuid: svc.uuid,
          characteristics: chars.map((c) => ({
            uuid: c.uuid,
            properties: ['read', 'write', 'writeWithoutResponse', 'notify', 'indicate', 'broadcast']
              .filter((p) => (c.properties as any)[p]),
          })),
        })
      }
      setServices(svcList)
      addRx(`${svcList.length} services found`, '')
    } catch (err: any) {
      addRx('Connect error: ' + err.message, '')
    }
  }, [bleDevice, addTx, addRx])

  /* ── Disconnect ── */
  const handleDisconnect = useCallback(async () => {
    if (bleDevice?.gatt?.connected) {
      bleDevice.gatt.disconnect()
    }
    // Cleanup all notify subscriptions
    for (const [, char] of notifyRef.current) {
      try { char.stopNotifications() } catch { /* ignore */ }
    }
    notifyRef.current.clear()
    setBleServer(null)
    setServices([])
    setNotifyLog([])
    setRssi(null)
    addTx('Disconnected', '')
  }, [bleDevice, addTx])

  /* ── Read characteristic ── */
  const handleReadChar = useCallback(async (svcUuid: string, charUuid: string) => {
    if (!bleServer) return
    try {
      const svc = await bleServer.getPrimaryService(svcUuid)
      const char = await svc.getCharacteristic(charUuid)
      const value = await char.readValue()
      const bytes = new Uint8Array(value.buffer)
      const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join(' ')
      addTx(`Read ${shortUuid(charUuid)}`, '')
      addRx(`Value: ${hex}`, bytes.length > 0 ? hex : '(empty)')
      // Update local state
      setServices((prev) => prev.map((s) =>
        s.uuid === svcUuid ? {
          ...s, characteristics: s.characteristics.map((c) =>
            c.uuid === charUuid ? { ...c, value: bytes } : c)
        } : s
      ))
    } catch (err: any) {
      addRx('Read error: ' + err.message, '')
    }
  }, [bleServer, addTx, addRx])

  /* ── Write characteristic ── */
  const handleWriteChar = useCallback(async (svcUuid: string, charUuid: string, val: string) => {
    if (!bleServer || !val.trim()) return
    try {
      const svc = await bleServer.getPrimaryService(svcUuid)
      const char = await svc.getCharacteristic(charUuid)
      const bytes = val.replace(/\s/g, '').match(/.{1,2}/g)?.map((b) => parseInt(b, 16)) ?? []
      if (bytes.length === 0) return
      addTx(`Write ${shortUuid(charUuid)}: ${val}`, '')
      await char.writeValue(new Uint8Array(bytes))
      addRx('Write OK', `${bytes.length} bytes`)
    } catch (err: any) {
      addRx('Write error: ' + err.message, '')
    }
  }, [bleServer, addTx, addRx])

  /* ── Notify subscribe ── */
  const handleToggleNotify = useCallback(async (svcUuid: string, charUuid: string) => {
    if (!bleServer) return
    try {
      const svc = await bleServer.getPrimaryService(svcUuid)
      const char = await svc.getCharacteristic(charUuid)
      const key = `${svcUuid}:${charUuid}`

      if (notifyRef.current.has(key)) {
        const existing = notifyRef.current.get(key)!
        await existing.stopNotifications()
        notifyRef.current.delete(key)
        addTx(`Unsubscribe ${shortUuid(charUuid)}`, '')
        addRx('Notifications stopped', '')
      } else {
        await char.startNotifications()
        char.addEventListener('characteristicvaluechanged', (event: Event) => {
          const value = (event.target as BluetoothRemoteGATTCharacteristic).value
          if (value) {
            const bytes = new Uint8Array(value.buffer)
            const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join(' ')
            const ts = new Date().toLocaleTimeString('en-US', { hour12: false })
            setNotifyLog((prev) => {
              const next = [...prev, `${ts} ${shortUuid(charUuid)}: ${hex}`]
              return next.length > 50 ? next.slice(-50) : next
            })
            addRx(`Notify ${shortUuid(charUuid)}`, hex)
          }
        })
        notifyRef.current.set(key, char)
        addTx(`Subscribe ${shortUuid(charUuid)}`, '')
        addRx('Notifications started', '')
      }
    } catch (err: any) {
      addRx('Subscribe error: ' + err.message, '')
    }
  }, [bleServer, addTx, addRx])

  return (
    <div className="protocol-panel">
      <div className="pp-header">
        <span className="pp-icon">📶</span>
        <span className="pp-title">BLE Explorer</span>
      </div>

      {/* Scan + Connect */}
      <div className="pp-row">
        <button className="pp-btn pp-btn--scan" onClick={handleScan} disabled={scanning}>
          {scanning ? 'Scanning…' : '📡 Scan'}
        </button>
        {bleDevice && !bleServer && (
          <button className="pp-btn pp-btn--read" onClick={handleConnect}>
            Connect
          </button>
        )}
        {bleServer && (
          <button className="pp-btn" onClick={handleDisconnect}>
            Disconnect
          </button>
        )}
        {bleDevice && (
          <span className="pp-hint" style={{ alignSelf: 'center', fontSize: 12, color: 'var(--accent)' }}>
            {bleDevice.name || 'Unknown Device'}
            {rssi !== null && ` (RSSI: ${rssi}dBm)`}
          </span>
        )}
      </div>

      {/* GATT Services */}
      {services.length > 0 && (
        <div className="pp-field pp-field--grow">
          <label>GATT Services ({services.length})</label>
          <div style={{ maxHeight: 400, overflow: 'auto', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
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
                            Value: {Array.from(ch.value).map((b) => b.toString(16).padStart(2, '0')).join(' ')}
                          </div>
                        )}

                        <div style={{ display: 'flex', gap: 4 }}>
                          {ch.properties.includes('read') && (
                            <button
                              className="log-toolbar__btn"
                              onClick={() => handleReadChar(svc.uuid, ch.uuid)}
                              style={{ fontSize: 10, padding: '1px 6px' }}
                            >
                              R
                            </button>
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
                              <button
                                className="log-toolbar__btn"
                                onClick={() => handleWriteChar(svc.uuid, ch.uuid, charValue)}
                                style={{ fontSize: 10, padding: '1px 6px' }}
                              >
                                W
                              </button>
                            </>
                          )}
                          {(ch.properties.includes('notify') || ch.properties.includes('indicate')) && (
                            <button
                              className={`log-toolbar__btn ${notifyRef.current.has(`${svc.uuid}:${ch.uuid}`) ? 'log-toolbar__btn--active' : ''}`}
                              onClick={() => handleToggleNotify(svc.uuid, ch.uuid)}
                              style={{ fontSize: 10, padding: '1px 6px' }}
                            >
                              {notifyRef.current.has(`${svc.uuid}:${ch.uuid}`) ? '⏹ N' : '▶ N'}
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

      {!bleDevice && (
        <div className="pp-placeholder">
          Click 📡 Scan to open the Bluetooth device picker.
        </div>
      )}
    </div>
  )
}
