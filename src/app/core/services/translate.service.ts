import { Injectable, inject, signal, computed, isDevMode } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface LocaleInfo {
  code: string;
  name: string;
  nativeName: string;
  dir: 'ltr' | 'rtl';
}

const LOCALE_STORAGE_KEY = 'chora-locale';

/**
 * Humanise a translation key into a readable fallback label: take the last
 * dotted segment, split snake_case / kebab-case / camelCase into words, and
 * sentence-case it. "billing.subscription_title" -> "Subscription title".
 * Used as the PRODUCTION fallback for a missing key so users never see a raw
 * dotted key (dev/test surface the raw key instead — see TranslateService.instant).
 */
export function humanizeI18nKey(key: string): string {
  const last = key.split('.').pop() ?? key;
  const words = last
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  if (!words) {
    return key;
  }
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Substitute `{{ token }}` placeholders in a resolved string with values from
 * the params bag (ngx-translate default syntax — the i18n JSON is authored for
 * it). An unmatched placeholder is left verbatim (fail-visible, never crashes);
 * a message with no placeholders is returned unchanged.
 */
export function interpolateI18n(
  text: string,
  params: Record<string, string | number>,
): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name)
      ? String(params[name])
      : whole,
  );
}

@Injectable({ providedIn: 'root' })
export class TranslateService {
  private readonly http = inject(HttpClient);
  private readonly _translations = signal<Record<string, string>>({});
  private readonly _currentLang = signal('en');

  /** Missing keys already warned about (dev only) so each logs at most once. */
  private readonly _warnedMissing = new Set<string>();

  readonly currentLang = this._currentLang.asReadonly();

  readonly availableLocales = signal<LocaleInfo[]>([
    { code: 'en', name: 'English', nativeName: 'English', dir: 'ltr' },
    { code: 'zh-CN', name: 'Chinese (Simplified)', nativeName: '简体中文', dir: 'ltr' },
    { code: 'ms-MY', name: 'Malay', nativeName: 'Bahasa Melayu', dir: 'ltr' },
    { code: 'ta-IN', name: 'Tamil', nativeName: 'தமிழ்', dir: 'ltr' },
    { code: 'ar-SA', name: 'Arabic', nativeName: 'العربية', dir: 'rtl' },
  ]);

  readonly direction = computed<'ltr' | 'rtl'>(() => {
    const lang = this._currentLang();
    const locale = this.availableLocales().find((l) => l.code === lang);
    return locale?.dir ?? 'ltr';
  });

  readonly currentLocale = computed<LocaleInfo>(() => {
    const lang = this._currentLang();
    return (
      this.availableLocales().find((l) => l.code === lang) ?? this.availableLocales()[0]
    );
  });

  async loadTranslations(lang: string): Promise<void> {
    this._currentLang.set(lang);
    try {
      const raw = await firstValueFrom(
        this.http.get<Record<string, unknown>>(`/assets/i18n/${lang}.json`),
      );
      this._translations.set(this.flatten(raw));
    } catch {
      // Translations load failure is non-blocking — keys shown as fallback
    }
  }

  async switchLanguage(lang: string): Promise<void> {
    await this.loadTranslations(lang);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, lang);
    } catch {
      // localStorage may be unavailable (e.g., private browsing quota exceeded)
    }
  }

  initFromStorage(): void {
    let lang = 'en';
    try {
      const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
      if (stored && this.availableLocales().some((l) => l.code === stored)) {
        lang = stored;
      }
    } catch {
      // localStorage unavailable — use default
    }
    this.loadTranslations(lang);
  }

  /**
   * Resolve a translation key to its current-locale string.
   *
   * On a miss: in dev/test return the raw key (so engineers and tests catch the
   * missing translation, with a one-time warning). In PRODUCTION never return a
   * raw dotted key to users; fall back to a humanised label (see
   * humanizeI18nKey). Prod builds call enableProdMode(), so isDevMode() is false
   * there and learners read "Subscription title", not "billing.subscription_title".
   *
   * Optional `params` substitute `{{ token }}` placeholders in the resolved
   * string (ngx-translate default syntax — the i18n JSON is authored for it).
   */
  instant(key: string, params?: Record<string, string | number>): string {
    const hit = this._translations()[key];
    let text: string;
    if (hit !== undefined) {
      text = hit;
    } else if (isDevMode()) {
      if (!this._warnedMissing.has(key)) {
        this._warnedMissing.add(key);
        console.warn(`[i18n] missing translation key: ${key}`);
      }
      text = key;
    } else {
      text = humanizeI18nKey(key);
    }
    return params ? interpolateI18n(text, params) : text;
  }

  private flatten(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) {
      const newKey = prefix ? `${prefix}.${k}` : k;
      if (typeof v === 'object' && v !== null) {
        Object.assign(result, this.flatten(v as Record<string, unknown>, newKey));
      } else {
        result[newKey] = String(v);
      }
    }
    return result;
  }
}
