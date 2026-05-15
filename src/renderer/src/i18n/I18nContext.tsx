import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { translations, type Lang } from './translations'

const LS_KEY = 'sakura-lang'

function detectLang(): Lang {
  try {
    const stored = localStorage.getItem(LS_KEY) as Lang | null
    if (stored === 'zh' || stored === 'en') return stored
    const nav = navigator.language.toLowerCase()
    return nav.startsWith('zh') ? 'zh' : 'en'
  } catch {
    return 'zh'
  }
}

interface I18nContextValue {
  lang: Lang
  t: (key: string, params?: Record<string, string>) => string
  setLang: (lang: Lang) => void
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang)

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    try { localStorage.setItem(LS_KEY, l) } catch { /* noop */ }
  }, [])

  const t = useCallback(
    (key: string, params?: Record<string, string>): string => {
      let text = translations[lang][key] ?? translations['en'][key] ?? key
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          text = text.replace(`{${k}}`, v)
        }
      }
      return text
    },
    [lang]
  )

  return (
    <I18nContext.Provider value={{ lang, t, setLang }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useT() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useT must be used within I18nProvider')
  return ctx
}
