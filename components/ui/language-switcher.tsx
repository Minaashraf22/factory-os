'use client';

import { useI18n } from '@/lib/i18n';
import { Globe } from 'lucide-react';
import { cn } from '@/lib/utils';

export function LanguageSwitcher({ collapsed }: { collapsed?: boolean }) {
  const { lang, setLang } = useI18n();

  return (
    <button
      onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
      className={cn(
        'flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors w-full',
        collapsed && 'justify-center'
      )}
      title={lang === 'ar' ? 'Switch to English' : 'التحويل للعربية'}
    >
      <Globe className="w-4 h-4 flex-shrink-0" />
      {!collapsed && (
        <span className="font-medium">
          {lang === 'ar' ? 'EN / عربي' : 'AR / English'}
        </span>
      )}
    </button>
  );
}
