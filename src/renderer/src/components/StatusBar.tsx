import { useT } from '../i18n/I18nContext'

interface Props {
  isOpen: boolean
  selectedPort: string
  baudRate: number
  dataBits: number
  stopBits: number
  parity: string
  txCount: number
  rxCount: number
}

function parityLabel(p: string): string {
  switch (p) {
    case 'none': return 'N'
    case 'even': return 'E'
    case 'odd': return 'O'
    case 'mark': return 'M'
    case 'space': return 'S'
    default: return p[0]?.toUpperCase() || 'N'
  }
}

export default function StatusBar({
  isOpen, selectedPort, baudRate, dataBits, stopBits, parity, txCount, rxCount
}: Props) {
  const { t } = useT()
  const portName = selectedPort || t('status.na')
  const config = isOpen
    ? `${baudRate.toLocaleString()} ${dataBits}${parityLabel(parity)}${stopBits}`
    : t('status.na')

  return (
    <div className="status-bar">
      <div className="status-bar__left">
        <div className="status-bar__item">
          <span className={`status-bar__dot ${isOpen ? 'status-bar__dot--connected' : 'status-bar__dot--disconnected'}`} />
          <span className="status-bar__label">{t('status.status')}</span>
          <span className="status-bar__value" style={{ color: isOpen ? 'var(--accent)' : 'var(--text-muted)' }}>
            {isOpen ? t('status.connected') : t('status.disconnected')}
          </span>
        </div>
        <div className="status-bar__item">
          <span className="status-bar__label">{t('status.port')}</span>
          <span className="status-bar__value">{portName}</span>
        </div>
        <div className="status-bar__item">
          <span className="status-bar__label">{t('status.config')}</span>
          <span className="status-bar__value">{config}</span>
        </div>
      </div>

      <div className="status-bar__right">
        <div className="status-bar__item">
          <span className="status-bar__label">{t('status.tx')}</span>
          <span className="status-bar__value" style={{ color: 'var(--secondary)' }}>
            {txCount.toLocaleString()}
          </span>
        </div>
        <div className="status-bar__item">
          <span className="status-bar__label">{t('status.rx')}</span>
          <span className="status-bar__value" style={{ color: 'var(--accent)' }}>
            {rxCount.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  )
}
