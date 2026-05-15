import { useRef, useEffect } from 'react'
import type { TerminalEntry } from '../App'
import { useT } from '../i18n/I18nContext'

interface Props {
  entries: TerminalEntry[]
  showHex: boolean
  showTimestamp: boolean
  autoScroll: boolean
  onToggleHex: () => void
  onToggleTimestamp: () => void
  onToggleAutoScroll: () => void
  onClear: () => void
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString('en-US', { hour12: false }) + '.' +
    String(d.getMilliseconds()).padStart(3, '0')
}

function formatHex(hex: string): string {
  if (!hex) return ''
  const parts: string[] = []
  for (let i = 0; i < hex.length; i += 2) {
    parts.push(hex.substring(i, i + 2).toUpperCase())
  }
  return parts.join(' ')
}

export default function Terminal({
  entries, showHex, showTimestamp, autoScroll,
  onToggleHex, onToggleTimestamp, onToggleAutoScroll, onClear
}: Props) {
  const { t } = useT()
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [entries, autoScroll])

  return (
    <>
      {/* Toolbar */}
      <div className="terminal-toolbar">
        <button
          className={`terminal-toolbar__btn ${showTimestamp ? 'terminal-toolbar__btn--active' : ''}`}
          onClick={onToggleTimestamp}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          {t('term.timestamp')}
        </button>
        <button
          className={`terminal-toolbar__btn ${showHex ? 'terminal-toolbar__btn--active' : ''}`}
          onClick={onToggleHex}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
          </svg>
          {t('term.hex')}
        </button>
        <button
          className={`terminal-toolbar__btn ${autoScroll ? 'terminal-toolbar__btn--active' : ''}`}
          onClick={onToggleAutoScroll}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>
          </svg>
          {t('term.autoscroll')}
        </button>
        <div className="terminal-toolbar__spacer" />
        <span className="terminal-toolbar__counter">
          {t('term.lines', { n: entries.length.toLocaleString() })}
        </span>
        <button className="terminal-toolbar__btn" onClick={onClear}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3
              0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
          {t('term.clear')}
        </button>
      </div>

      {/* Output */}
      <div className="terminal-output" ref={containerRef}>
        {entries.length === 0 ? (
          <div className="terminal-empty">
            <div className="terminal-empty__icon">🌸</div>
            <div className="terminal-empty__text">{t('term.empty')}</div>
          </div>
        ) : (
          entries.map((entry) => (
            <div className="terminal-line" key={entry.id}>
              {showTimestamp && (
                <span className="terminal-line__time">
                  {formatTime(entry.timestamp)}
                </span>
              )}
              <span className={`terminal-line__dir terminal-line__dir--${entry.direction}`}>
                {t('term.direction.' + entry.direction)}
              </span>
              {showHex && entry.hex ? (
                <span className="terminal-line__hex">
                  {formatHex(entry.hex)}
                </span>
              ) : (
                <span className={`terminal-line__data terminal-line__data--${entry.direction}`}>
                  {entry.data}
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </>
  )
}
