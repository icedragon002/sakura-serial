import { useT } from '../i18n/I18nContext'

interface Props {
  isConnected: boolean
  sidebarWidth: number
  onDismiss: () => void
}

export default function Mascot({ isConnected, sidebarWidth, onDismiss }: Props) {
  const { t } = useT()

  return (
    <div className="mascot" style={{ left: sidebarWidth + 12 }}>
      <button className="mascot__dismiss" onClick={onDismiss} title="Hide">✕</button>
      <div className="mascot__ai-hint">AI</div>
      <div className="mascot__bubble">
        {isConnected ? t('mascot.connected') : t('mascot.waiting')}
      </div>
      <div className="mascot__body" title="AI Assistant — click to interact (coming soon)">
        <div className="mascot__ear mascot__ear--left" />
        <div className="mascot__ear mascot__ear--right" />
        <div className="mascot__face">
          <div className="mascot__eye mascot__eye--left" />
          <div className="mascot__eye mascot__eye--right" />
          <div className="mascot__blush mascot__blush--left" />
          <div className="mascot__blush mascot__blush--right" />
          <div className="mascot__mouth" />
        </div>
      </div>
    </div>
  )
}
