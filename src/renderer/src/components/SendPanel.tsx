import { useState, useRef, useCallback, useEffect } from 'react'
import { useT } from '../i18n/I18nContext'

interface Props {
  isOpen: boolean
  onSend: (data: string, isHex: boolean) => void
}

const HISTORY_MAX = 50

export default function SendPanel({ isOpen, onSend }: Props) {
  const { t } = useT()
  const [input, setInput] = useState('')
  const [isHex, setIsHex] = useState(false)
  const [history, setHistory] = useState<string[]>([])
  const [historyIdx, setHistoryIdx] = useState(-1)
  const [appendNewline, setAppendNewline] = useState(true)

  // Auto-send state
  const [autoEnabled, setAutoEnabled] = useState(false)
  const [autoInterval, setAutoInterval] = useState(1000)
  const autoRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) inputRef.current?.focus()
  }, [isOpen])

  const doSend = useCallback(() => {
    if (!input.trim()) return
    let data = input
    if (appendNewline && !isHex) data += '\r\n'

    onSend(data, isHex)
    setHistory((prev) => {
      const next = [input, ...prev.filter((h) => h !== input)]
      return next.length > HISTORY_MAX ? next.slice(0, HISTORY_MAX) : next
    })
    setHistoryIdx(-1)
    setInput('')
    inputRef.current?.focus()
  }, [input, isHex, appendNewline, onSend])

  // Auto-send interval
  useEffect(() => {
    if (autoRef.current) { clearInterval(autoRef.current); autoRef.current = null }

    if (autoEnabled && isOpen && input.trim()) {
      autoRef.current = setInterval(() => {
        doSend()
      }, Math.max(50, autoInterval))
    }
    return () => {
      if (autoRef.current) { clearInterval(autoRef.current); autoRef.current = null }
    }
  }, [autoEnabled, autoInterval, isOpen, doSend])

  const handleSend = useCallback(() => {
    doSend()
  }, [doSend])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      doSend()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHistoryIdx((prev) => {
        const next = prev + 1
        if (next >= history.length) return prev
        setInput(history[next])
        return next
      })
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHistoryIdx((prev) => {
        const next = prev - 1
        if (next < 0) { setInput(''); return -1 }
        setInput(history[next])
        return next
      })
    }
  }, [doSend, history])

  const validateHex = (value: string): boolean => /^[0-9a-fA-F\s]*$/.test(value)

  const handleInputChange = (value: string) => {
    if (isHex && !validateHex(value)) return
    setInput(value)
  }

  return (
    <div className="send-panel">
      {/* Options row */}
      <div className="send-panel__options">
        <button
          className={`send-panel__option-btn ${isHex ? 'active' : ''}`}
          onClick={() => setIsHex((v) => !v)}
        >{t('send.hex')}</button>
        <button
          className={`send-panel__option-btn ${appendNewline ? 'active' : ''}`}
          onClick={() => setAppendNewline((v) => !v)}
        >{t('send.crlf')}</button>
        <span className="send-panel__charcount">
          {t('send.chars', { n: String(input.length) })}
        </span>
      </div>

      {/* Auto-send row */}
      <div className="send-panel__auto-row">
        <span className="send-panel__auto-label">{t('send.auto')}</span>
        <input
          className="send-panel__auto-input"
          type="number"
          value={autoInterval}
          onChange={(e) => setAutoInterval(Math.max(50, Number(e.target.value) || 1000))}
          min={50}
          step={100}
          disabled={!isOpen}
        />
        <span className="send-panel__auto-unit">ms</span>
        <button
          className={`send-panel__auto-toggle ${autoEnabled ? 'send-panel__auto-toggle--active' : ''}`}
          onClick={() => setAutoEnabled((v) => !v)}
          disabled={!isOpen}
        >
          {autoEnabled ? t('send.autoStop') : t('send.autoStart')}
        </button>
      </div>

      {/* Input row */}
      <div className="send-panel__row">
        <div className="send-panel__input-wrap">
          <input
            ref={inputRef}
            className="send-panel__input"
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isHex ? t('send.placeholder.hex') : t('send.placeholder')}
            disabled={!isOpen}
            spellCheck={false}
            autoComplete="off"
          />
        </div>
        <button
          className="send-panel__btn send-panel__btn--send"
          onClick={handleSend}
          disabled={!isOpen || !input.trim()}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
          {t('send.send')}
        </button>
      </div>

      <div className="send-panel__hint">
        {t('send.hint')}
        {appendNewline && <> · {t('send.hint.crlf')}</>}
      </div>
    </div>
  )
}
