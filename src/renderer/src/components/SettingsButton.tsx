import { useState, useRef, useEffect } from 'react'
import { useT } from '../i18n/I18nContext'
import type { Lang } from '../i18n/translations'

export type Theme = 'sakura' | 'light' | 'dark'

interface Props {
  theme: Theme
  onSetTheme: (t: Theme) => void
  showParticles: boolean
  showMascot: boolean
  onToggleParticles: (v: boolean) => void
  onToggleMascot: (v: boolean) => void
}

const THEMES: Theme[] = ['sakura', 'light', 'dark']

export default function SettingsButton({
  theme, onSetTheme, showParticles, showMascot, onToggleParticles, onToggleMascot
}: Props) {
  const { t, lang, setLang } = useT()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="settings-btn-wrap" ref={ref}>
      <button
        className="title-bar__btn settings-btn"
        onClick={() => setOpen((v) => !v)}
        title={t('settings.title')}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65
            1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9
            19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68
            15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33
            -1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1
            -1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1
            2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65
            1.65 0 0 0-1.51 1z"/>
        </svg>
      </button>

      {open && (
        <div className="settings-dropdown">
          <div className="settings-dropdown__section">
            <div className="settings-dropdown__label">{t('settings.language')}</div>
            <div className="settings-dropdown__lang-row">
              {(['zh', 'en'] as Lang[]).map((l) => (
                <button
                  key={l}
                  className={`settings-dropdown__lang-btn ${lang === l ? 'settings-dropdown__lang-btn--active' : ''}`}
                  onClick={() => { setLang(l); setOpen(false) }}
                >
                  {t(`settings.lang.${l}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-dropdown__section">
            <div className="settings-dropdown__label">{t('settings.theme')}</div>
            <div className="settings-dropdown__theme-row">
              {THEMES.map((th) => (
                <button
                  key={th}
                  className={`settings-dropdown__theme-btn settings-dropdown__theme-btn--${th} ${theme === th ? 'settings-dropdown__theme-btn--active' : ''}`}
                  onClick={() => onSetTheme(th)}
                >
                  {t(`settings.theme.${th}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-dropdown__section">
            <div className="settings-dropdown__label">{t('settings.display')}</div>
            <label className="settings-dropdown__toggle-row">
              <span>{t('settings.particles')}</span>
              <input type="checkbox" checked={showParticles}
                onChange={(e) => onToggleParticles(e.target.checked)} />
            </label>
            <label className="settings-dropdown__toggle-row">
              <span>{t('settings.mascot')}</span>
              <input type="checkbox" checked={showMascot}
                onChange={(e) => onToggleMascot(e.target.checked)} />
            </label>
          </div>
        </div>
      )}
    </div>
  )
}
