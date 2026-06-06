'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { en, type TranslationKey } from './translations/en';
import { ar } from './translations/ar';

export type { TranslationKey };

type Language = 'en' | 'ar';

interface I18nContextValue {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  dir: 'ltr' | 'rtl';
  isRtl: boolean;
}

const translations: Record<Language, Record<string, string>> = { en, ar };

const I18nContext = createContext<I18nContextValue>({
  lang: 'ar',
  setLang: () => {},
  t: (key) => en[key] || key,
  dir: 'rtl',
  isRtl: true,
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>('ar');

  useEffect(() => {
    const stored = localStorage.getItem('factoryos-lang') as Language;
    if (stored === 'en' || stored === 'ar') setLangState(stored);
  }, []);

  const setLang = useCallback((newLang: Language) => {
    setLangState(newLang);
    localStorage.setItem('factoryos-lang', newLang);
    document.documentElement.dir = newLang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = newLang;
  }, []);

  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang]);

  const t = useCallback((key: TranslationKey, vars?: Record<string, string | number>): string => {
    let text = translations[lang][key] || translations['en'][key] || key;
    if (vars) {
      Object.entries(vars).forEach(([k, v]) => {
        text = text.replace(`{{${k}}}`, String(v));
      });
    }
    return text;
  }, [lang]);

  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  return (
    <I18nContext.Provider value={{ lang, setLang, t, dir, isRtl: lang === 'ar' }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
