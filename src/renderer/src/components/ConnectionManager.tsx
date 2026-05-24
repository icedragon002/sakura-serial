import { useState, useEffect, useCallback } from 'react'
import type { DeviceInfo, TransportConfig } from '../../../shared/transport'
import { Session } from '../../../shared/transport'
import { BleTransport } from '../ble-transport'
import { useT } from '../i18n/I18nContext'

let bleSession: Session | null = null

export function getBleSession(): Session | null {
  return bleSession
}

interface Props {
  isConnected: boolean
  deviceName: string
  deviceInfo?: {
    firmwareVersion: string
    supportedProtocols: number[]
    transportType: string
  } | null
  onConnect: (config: TransportConfig) => Promise<void>
  onDisconnect: () => Promise<void>
}

export default function ConnectionManager({
  isConnected,
  deviceName,
  deviceInfo,
  onConnect,
  onDisconnect,
}: Props) {
  const { t } = useT()
  const [devices, setDevices] = useState<DeviceInfo[]>([])
  const [selectedPath, setSelectedPath] = useState('')
  const [connType, setConnType] = useState<'usb' | 'wifi' | 'ble'>('usb')
  const [wifiHost, setWifiHost] = useState('')
  const [wifiPort, setWifiPort] = useState('7777')
  const [connecting, setConnecting] = useState(false)

  const refreshDevices = useCallback(async () => {
    try {
      const list = await window.deviceApi.listDevices()
      setDevices(list)
    } catch {
      setDevices([])
    }
  }, [])

  useEffect(() => {
    refreshDevices()
    const interval = setInterval(refreshDevices, 3000)
    return () => clearInterval(interval)
  }, [refreshDevices])

  const handleConnect = useCallback(async () => {
    setConnecting(true)
    try {
      if (connType === 'ble') {
        // BLE handled in renderer via Web Bluetooth + local Session
        try {
          const transport = new BleTransport()
          bleSession = new Session(transport, {
            timeout: 2000,
            maxRetries: 2,
            pingInterval: 5000,
          })
          await bleSession.open({ type: 'ble', path: '' })
          // Use onConnect to notify App about the connection
          await onConnect({ type: 'ble', path: 'ble://device' })
        } catch (err: any) {
          console.error('BLE connection failed:', err)
          setConnecting(false)
        }
        return
      }

      const config: TransportConfig =
        connType === 'usb'
          ? { type: 'usb', path: selectedPath }
          : { type: 'wifi', path: `${wifiHost}:${wifiPort}`, host: wifiHost, port: parseInt(wifiPort) || 7777 }
      await onConnect(config)
    } catch (err: any) {
      console.error('Connection failed:', err)
    } finally {
      setConnecting(false)
    }
  }, [connType, selectedPath, wifiHost, onConnect])

  const handleDisconnect = useCallback(async () => {
    await onDisconnect()
  }, [onDisconnect])

  return (
    <div className="connection-manager">
      <div className="cm-header">
        <div className={`cm-status ${isConnected ? 'cm-status--connected' : ''}`} />
        <span className="cm-title">
          {isConnected ? deviceName || t('conn.connected') : t('conn.disconnected')}
        </span>
      </div>

      {!isConnected && (
        <>
          {/* Transport type tabs */}
          <div className="cm-tabs">
            <button
              className={`cm-tab ${connType === 'usb' ? 'cm-tab--active' : ''}`}
              onClick={() => setConnType('usb')}
            >
              USB
            </button>
            <button
              className={`cm-tab ${connType === 'wifi' ? 'cm-tab--active' : ''}`}
              onClick={() => setConnType('wifi')}
            >
              WiFi
            </button>
            <button
              className={`cm-tab ${connType === 'ble' ? 'cm-tab--active' : ''}`}
              onClick={() => setConnType('ble')}
            >
              BLE
            </button>
          </div>

          {connType === 'ble' ? (
            <div className="cm-section">
              <div className="cm-label">Web Bluetooth</div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                {t('conn.bleHint')}
              </p>
            </div>
          ) : connType === 'usb' ? (
            <>
              <div className="cm-section">
                <div className="cm-label">Serial Ports</div>
                <select
                  className="cm-select"
                  value={selectedPath}
                  onChange={(e) => setSelectedPath(e.target.value)}
                >
                  <option value="">{t('conn.selectPort')}</option>
                  {devices
                    .filter((d) => d.type === 'usb')
                    .map((d) => (
                      <option key={d.id} value={d.path}>
                        {d.name} ({d.path})
                      </option>
                    ))}
                </select>
                <button className="cm-refresh" onClick={refreshDevices}>
                  ↻ {t('conn.refresh')}
                </button>
              </div>
            </>
          ) : (
            <div className="cm-section">
              <div className="cm-label">{t('conn.hostPort')}</div>
              <div style={{ display: 'flex', gap: 4 }}>
                <input
                  className="cm-input"
                  value={wifiHost}
                  onChange={(e) => setWifiHost(e.target.value)}
                  placeholder="192.168.1.100"
                  style={{ flex: 1 }}
                  spellCheck={false}
                />
                <input
                  className="cm-input"
                  value={wifiPort}
                  onChange={(e) => setWifiPort(e.target.value.replace(/\D/g, ''))}
                  placeholder="7777"
                  style={{ width: 70 }}
                  spellCheck={false}
                />
              </div>
            </div>
          )}

          <button
            className="cm-connect-btn"
            onClick={handleConnect}
            disabled={connecting || (connType === 'usb' ? !selectedPath : connType === 'ble' ? false : !wifiHost)}
          >
            {connecting ? t('conn.connecting') : t('conn.connect')}
          </button>
        </>
      )}

      {isConnected && (
        <button className="cm-disconnect-btn" onClick={handleDisconnect}>
          {t('conn.disconnect')}
        </button>
      )}

      {/* Device info (when connected) */}
      {isConnected && (
        <div className="cm-info">
          <div className="cm-info-row">
            <span>{t('conn.transport')}</span>
            <span>{deviceInfo?.transportType ?? 'USB CDC'}</span>
          </div>
          {deviceInfo?.firmwareVersion && (
            <div className="cm-info-row">
              <span>{t('conn.firmware')}</span>
              <span>{deviceInfo.firmwareVersion}</span>
            </div>
          )}
          {deviceInfo?.supportedProtocols && deviceInfo.supportedProtocols.length > 0 && (
            <div className="cm-info-row">
              <span>{t('conn.protocols')}</span>
              <span>{t('conn.supported', { n: String(deviceInfo.supportedProtocols.length) })}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
