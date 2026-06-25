'use client'

import * as React from 'react'
import { use } from 'react'
import {
  DEFAULT_LOCALE,
  Locale,
  MessageKey,
  normalizeLocale,
  t as translate,
} from '@/lib/i18n'

const STORAGE_KEY = 'nanoverse.locale'

interface I18nContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: MessageKey, values?: Record<string, string | number>) => string
}

const I18nContext = React.createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = React.useState<Locale>(() => {
    if (typeof window === 'undefined') return DEFAULT_LOCALE
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return normalizeLocale(stored ?? navigator.language)
  })

  React.useEffect(() => {
    document.documentElement.lang = locale
    window.localStorage.setItem(STORAGE_KEY, locale)
  }, [locale])

  const setLocale = React.useCallback((next: Locale) => {
    setLocaleState(next)
  }, [])

  const value = React.useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key, values) => translate(key, values, locale),
    }),
    [locale, setLocale],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const value = use(I18nContext)
  if (!value) {
    return {
      locale: DEFAULT_LOCALE,
      setLocale: () => {},
      t: (key, values) => translate(key, values, DEFAULT_LOCALE),
    }
  }
  return value
}
