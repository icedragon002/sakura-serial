import { useState } from 'react'
import { useT } from '../i18n/I18nContext'

interface Props {
  isConnected: boolean
  sidebarWidth: number
  onDismiss: () => void
}

const TIPS = [
  'Try Ctrl+R to record a macro!',
  'I²C scan finds all devices on the bus.',
  'Shift+click on LA waveform to place cursors.',
  'Script panel has 10 built-in examples.',
  'Use CAN loopback mode to test without bus.',
  'GPIO monitor polls the pin every 500ms.',
  'Export CAN frames as CSV for analysis.',
  'WiFi devices are auto-discovered via mDNS.',
  'DS18B20? Click 🌡 Read Temp on 1-Wire panel.',
  'Ctrl+1~5 switches between panels.',
]

export default function Mascot({ isConnected, sidebarWidth, onDismiss }: Props) {
  const { t } = useT()
  const [tip, setTip] = useState('')
  const [showTip, setShowTip] = useState(false)

  const handleClick = () => {
    const randomTip = TIPS[Math.floor(Math.random() * TIPS.length)]
    setTip(randomTip)
    setShowTip(true)
    setTimeout(() => setShowTip(false), 4000)
  }

  return (
    <div className="mascot" style={{ left: sidebarWidth + 12 }}>
      <button className="mascot__dismiss" onClick={onDismiss} title="Hide">✕</button>
      <div className="mascot__ai-hint">AI</div>
      {(showTip && tip) ? (
        <div className="mascot__bubble" style={{ fontSize: 10, maxWidth: 180 }}>
          {tip}
        </div>
      ) : (
        <div className="mascot__bubble">
          {isConnected ? t('mascot.connected') : t('mascot.waiting')}
        </div>
      )}
      <div className="mascot__body" onClick={handleClick} title="Click for a tip!" style={{ cursor: 'pointer' }}>
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
