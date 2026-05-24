import { useRef, useEffect, useCallback } from 'react'
import { useT } from '../i18n/I18nContext'

export interface TransactionEntry {
  id: number
  timestamp: number
  direction: 'tx' | 'rx'
  protocol: string
  summary: string
  data: string
}

interface Props {
  entries: TransactionEntry[]
  showTimestamp: boolean
  autoScroll: boolean
  onToggleTimestamp: () => void
  onToggleAutoScroll: () => void
  onClear: () => void
  onExport: (format: 'csv' | 'json') => void
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return (
    d.toLocaleTimeString('en-US', { hour12: false }) +
    '.' +
    String(d.getMilliseconds()).padStart(3, '0')
  )
}

export default function TransactionLog({
  entries,
  showTimestamp,
  autoScroll,
  onToggleTimestamp,
  onToggleAutoScroll,
  onClear,
  onExport,
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
      <div className="log-toolbar">
        <button
          className={`log-toolbar__btn ${showTimestamp ? 'log-toolbar__btn--active' : ''}`}
          onClick={onToggleTimestamp}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          Timestamp
        </button>
        <button
          className={`log-toolbar__btn ${autoScroll ? 'log-toolbar__btn--active' : ''}`}
          onClick={onToggleAutoScroll}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <polyline points="19 12 12 19 5 12"/>
          </svg>
          Auto-scroll
        </button>
        <div className="log-toolbar__spacer" />
        <span className="log-toolbar__counter">
          {entries.length.toLocaleString()} entries
        </span>
        <button className="log-export-btn" onClick={() => onExport('csv')} title="Export CSV">
          CSV
        </button>
        <button className="log-export-btn" onClick={() => onExport('json')} title="Export JSON" style={{ marginRight: 4 }}>
          JSON
        </button>
        <button className="log-toolbar__btn" onClick={onClear}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
          Clear
        </button>
      </div>

      {/* Log Output */}
      <div className="log-output" ref={containerRef}>
        {entries.length === 0 ? (
          <div className="log-empty">
            <div className="log-empty__icon">⚡</div>
            <div className="log-empty__text">
              Connect a device and start debugging
            </div>
          </div>
        ) : (
          entries.map((entry) => (
            <div className="log-line" key={entry.id}>
              {showTimestamp && (
                <span className="log-line__time">{formatTime(entry.timestamp)}</span>
              )}
              <span className="log-line__proto">{entry.protocol}</span>
              <span className={`log-line__dir log-line__dir--${entry.direction}`}>
                {entry.direction === 'tx' ? '→' : '←'}
              </span>
              <span className="log-line__summary">{entry.summary}</span>
              {entry.data && (
                <span className={`log-line__data log-line__data--${entry.direction}`}>
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
