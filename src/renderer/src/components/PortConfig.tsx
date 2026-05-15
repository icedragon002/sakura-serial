import { useState } from 'react'
import type { SerialPortInfo } from '../../../preload/index'
import { useT } from '../i18n/I18nContext'

const BAUD_RATES = [300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600]
const DATA_BITS = [5, 6, 7, 8] as const
const STOP_BITS = [1, 1.5, 2] as const
const PARITIES: { value: 'none' | 'even' | 'odd' | 'mark' | 'space' }[] = [
  { value: 'none' }, { value: 'even' }, { value: 'odd' }, { value: 'mark' }, { value: 'space' }
]
const FLOW_CONTROLS: { value: 'none' | 'rtscts' | 'xon/xoff' }[] = [
  { value: 'none' }, { value: 'rtscts' }, { value: 'xon/xoff' }
]

interface Props {
  ports: SerialPortInfo[]
  selectedPort: string
  onSelectPort: (path: string) => void
  baudRate: number
  onBaudRateChange: (rate: number) => void
  dataBits: 5 | 6 | 7 | 8
  onDataBitsChange: (db: 5 | 6 | 7 | 8) => void
  stopBits: 1 | 1.5 | 2
  onStopBitsChange: (sb: 1 | 1.5 | 2) => void
  parity: 'none' | 'even' | 'odd' | 'mark' | 'space'
  onParityChange: (p: 'none' | 'even' | 'odd' | 'mark' | 'space') => void
  flowControl: 'none' | 'rtscts' | 'xon/xoff'
  onFlowControlChange: (fc: 'none' | 'rtscts' | 'xon/xoff') => void
  isOpen: boolean
  onOpen: () => void
  onClose: () => void
  onRefresh: () => void
  dtr: boolean
  rts: boolean
  onDtrChange: (state: boolean) => void
  onRtsChange: (state: boolean) => void
}

export default function PortConfig({
  ports, selectedPort, onSelectPort,
  baudRate, onBaudRateChange,
  dataBits, onDataBitsChange,
  stopBits, onStopBitsChange,
  parity, onParityChange,
  flowControl, onFlowControlChange,
  isOpen, onOpen, onClose, onRefresh,
  dtr, rts, onDtrChange, onRtsChange
}: Props) {
  const { t } = useT()
  const [paramsOpen, setParamsOpen] = useState(true)

  return (
    <div className="port-config">
      {/* Connection Section */}
      <div className="port-config__section">
        <div className="port-config__label">{t('port.connection')}</div>

        <div className="port-config__port-row">
          <select
            value={selectedPort}
            onChange={(e) => onSelectPort(e.target.value)}
            disabled={isOpen}
          >
            <option value="">{t('port.select')}</option>
            {ports.map((p) => (
              <option key={p.path} value={p.path}>
                {p.manufacturer ? `${p.manufacturer} (${p.path})` : p.path}
              </option>
            ))}
          </select>
          <button
            className="port-config__icon-btn"
            onClick={onRefresh}
            title={t('port.refresh')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
          </button>
        </div>

        {isOpen ? (
          <button className="port-config__btn port-config__btn--close" onClick={onClose}>
            {t('port.disconnect')}
          </button>
        ) : (
          <button
            className="port-config__btn port-config__btn--open"
            onClick={onOpen}
            disabled={!selectedPort}
          >
            {t('port.connect')}
          </button>
        )}
      </div>

      {/* Parameters Section */}
      <div className="port-config__section">
        <button
          className="port-config__section-header"
          onClick={() => setParamsOpen((v) => !v)}
        >
          <span>{t('port.parameters')}</span>
          <svg
            className={`port-config__chevron ${paramsOpen ? 'port-config__chevron--open' : ''}`}
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>

        {paramsOpen && (
          <div className="port-config__params">
            <div className="port-config__field">
              <div className="port-config__sub-label">{t('port.baudRate')}</div>
              <select
                value={baudRate}
                onChange={(e) => onBaudRateChange(Number(e.target.value))}
                disabled={isOpen}
              >
                {BAUD_RATES.map((r) => (
                  <option key={r} value={r}>{r.toLocaleString()}</option>
                ))}
              </select>
            </div>

            <div className="port-config__field">
              <div className="port-config__sub-label">{t('port.dataBits')}</div>
              <select
                value={dataBits}
                onChange={(e) => onDataBitsChange(Number(e.target.value) as 5 | 6 | 7 | 8)}
                disabled={isOpen}
              >
                {DATA_BITS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            <div className="port-config__field">
              <div className="port-config__sub-label">{t('port.stopBits')}</div>
              <select
                value={stopBits}
                onChange={(e) => onStopBitsChange(Number(e.target.value) as 1 | 1.5 | 2)}
                disabled={isOpen}
              >
                {STOP_BITS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div className="port-config__field">
              <div className="port-config__sub-label">{t('port.parity')}</div>
              <select
                value={parity}
                onChange={(e) => onParityChange(e.target.value as typeof parity)}
                disabled={isOpen}
              >
                {PARITIES.map((p) => (
                  <option key={p.value} value={p.value}>{t(`parity.${p.value}`)}</option>
                ))}
              </select>
            </div>

            <div className="port-config__field">
              <div className="port-config__sub-label">{t('port.flowControl')}</div>
              <select
                value={flowControl}
                onChange={(e) => onFlowControlChange(e.target.value as typeof flowControl)}
                disabled={isOpen}
              >
                {FLOW_CONTROLS.map((f) => (
                  <option key={f.value} value={f.value}>{t(`flow.${f.value}`)}</option>
                ))}
              </select>
            </div>

            {/* DTR / RTS Toggles */}
            <div className="port-config__toggles">
              <button
                className={`port-config__toggle ${dtr ? 'port-config__toggle--active' : ''}`}
                onClick={() => onDtrChange(!dtr)}
                disabled={!isOpen}
              >
                <span className="port-config__toggle-dot" />
                {t('port.dtr')}
              </button>
              <button
                className={`port-config__toggle ${rts ? 'port-config__toggle--active' : ''}`}
                onClick={() => onRtsChange(!rts)}
                disabled={!isOpen}
              >
                <span className="port-config__toggle-dot" />
                {t('port.rts')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
