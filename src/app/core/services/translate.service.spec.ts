import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TranslateService, humanizeI18nKey } from './translate.service';

describe('TranslateService', () => {
  let service: TranslateService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(TranslateService);
    httpMock = TestBed.inject(HttpTestingController);
    localStorage.clear();
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('availableLocales', () => {
    it('should contain 5 locales', () => {
      expect(service.availableLocales().length).toBe(5);
    });

    it('should include English as first locale', () => {
      const first = service.availableLocales()[0];
      expect(first.code).toBe('en');
      expect(first.name).toBe('English');
      expect(first.nativeName).toBe('English');
      expect(first.dir).toBe('ltr');
    });

    it('should include Arabic with rtl direction', () => {
      const ar = service.availableLocales().find((l) => l.code === 'ar-SA');
      expect(ar).toBeTruthy();
      expect(ar!.dir).toBe('rtl');
      expect(ar!.nativeName).toBe('العربية');
    });

    it('should include Chinese Simplified', () => {
      const zh = service.availableLocales().find((l) => l.code === 'zh-CN');
      expect(zh).toBeTruthy();
      expect(zh!.nativeName).toBe('简体中文');
    });

    it('should include Malay', () => {
      const ms = service.availableLocales().find((l) => l.code === 'ms-MY');
      expect(ms).toBeTruthy();
      expect(ms!.nativeName).toBe('Bahasa Melayu');
    });

    it('should include Tamil', () => {
      const ta = service.availableLocales().find((l) => l.code === 'ta-IN');
      expect(ta).toBeTruthy();
      expect(ta!.nativeName).toBe('தமிழ்');
    });
  });

  describe('direction', () => {
    it('should return ltr for English (default)', () => {
      expect(service.direction()).toBe('ltr');
    });

    it('should return rtl for ar-SA', () => {
      service.loadTranslations('ar-SA');
      const req = httpMock.expectOne('/assets/i18n/ar-SA.json');
      req.flush({});

      expect(service.direction()).toBe('rtl');
    });

    it('should return ltr for zh-CN', () => {
      service.loadTranslations('zh-CN');
      const req = httpMock.expectOne('/assets/i18n/zh-CN.json');
      req.flush({});

      expect(service.direction()).toBe('ltr');
    });

    it('should default to ltr for unknown locale', () => {
      service.loadTranslations('xx-XX');
      const req = httpMock.expectOne('/assets/i18n/xx-XX.json');
      req.flush({});

      expect(service.direction()).toBe('ltr');
    });
  });

  describe('currentLocale', () => {
    it('should return English locale info by default', () => {
      const locale = service.currentLocale();
      expect(locale.code).toBe('en');
      expect(locale.nativeName).toBe('English');
    });

    it('should update after switching language', () => {
      service.loadTranslations('ms-MY');
      const req = httpMock.expectOne('/assets/i18n/ms-MY.json');
      req.flush({});

      const locale = service.currentLocale();
      expect(locale.code).toBe('ms-MY');
      expect(locale.nativeName).toBe('Bahasa Melayu');
    });

    it('should fall back to first locale for unknown code', () => {
      service.loadTranslations('xx-XX');
      const req = httpMock.expectOne('/assets/i18n/xx-XX.json');
      req.flush({});

      const locale = service.currentLocale();
      expect(locale.code).toBe('en');
    });
  });

  describe('loadTranslations', () => {
    it('should set current language', () => {
      service.loadTranslations('zh-CN');
      const req = httpMock.expectOne('/assets/i18n/zh-CN.json');
      req.flush({});

      expect(service.currentLang()).toBe('zh-CN');
    });

    it('should flatten nested translation objects', async () => {
      const promise = service.loadTranslations('en');
      const req = httpMock.expectOne('/assets/i18n/en.json');
      req.flush({ nav: { dashboard: 'Dashboard', atoms: 'Atoms' } });
      await promise;

      expect(service.instant('nav.dashboard')).toBe('Dashboard');
      expect(service.instant('nav.atoms')).toBe('Atoms');
    });

    it('should handle load failure gracefully', () => {
      service.loadTranslations('en');
      const req = httpMock.expectOne('/assets/i18n/en.json');
      req.error(new ProgressEvent('Network error'));

      // Should not throw — keys shown as fallback
      expect(service.currentLang()).toBe('en');
    });
  });

  describe('instant', () => {
    it('should return translation value for known key', async () => {
      const promise = service.loadTranslations('en');
      const req = httpMock.expectOne('/assets/i18n/en.json');
      req.flush({ greeting: 'Hello' });
      await promise;

      expect(service.instant('greeting')).toBe('Hello');
    });

    it('returns the raw key in dev/test for a missing key (so missing translations are caught)', () => {
      expect(service.instant('missing.key')).toBe('missing.key');
      expect(service.instant('a.b.c.d')).toBe('a.b.c.d');
    });
  });

  describe('instant interpolation ({{ token }} params)', () => {
    async function loadEn(payload: Record<string, unknown>): Promise<void> {
      const promise = service.loadTranslations('en');
      httpMock.expectOne('/assets/i18n/en.json').flush(payload);
      await promise;
    }

    it('substitutes {{token}} placeholders from the params bag', async () => {
      await loadEn({ summary: '{{total}} maps · {{excluded}} excluded' });
      expect(service.instant('summary', { total: 12, excluded: 3 })).toBe(
        '12 maps · 3 excluded',
      );
    });

    it('tolerates surrounding whitespace in the placeholder', async () => {
      await loadEn({ page: 'Page {{ page }} of {{ count }}' });
      expect(service.instant('page', { page: 1, count: 3 })).toBe('Page 1 of 3');
    });

    it('leaves an unmatched placeholder untouched (fail-visible, no crash)', async () => {
      await loadEn({ hi: 'Hello {{name}}' });
      expect(service.instant('hi', { other: 'x' })).toBe('Hello {{name}}');
    });

    it('is a no-op when no params are passed', async () => {
      await loadEn({ hi: 'Hello {{name}}' });
      expect(service.instant('hi')).toBe('Hello {{name}}');
    });
  });

  describe('humanizeI18nKey (production fallback)', () => {
    it('humanizes the last dotted segment', () => {
      expect(humanizeI18nKey('billing.subscription_title')).toBe('Subscription title');
    });
    it('humanizes a deeply nested key', () => {
      expect(humanizeI18nKey('a.b.c.some_thing')).toBe('Some thing');
    });
    it('splits camelCase', () => {
      expect(humanizeI18nKey('oplus.dashboard.toolCoverage')).toBe('Tool coverage');
    });
    it('never emits a raw dotted key', () => {
      expect(humanizeI18nKey('a.b.c.d')).not.toContain('.');
    });
  });

  describe('switchLanguage', () => {
    it('should load new translations', async () => {
      const promise = service.switchLanguage('zh-CN');
      const req = httpMock.expectOne('/assets/i18n/zh-CN.json');
      req.flush({ nav: { dashboard: '仪表板' } });
      await promise;

      expect(service.currentLang()).toBe('zh-CN');
      expect(service.instant('nav.dashboard')).toBe('仪表板');
    });

    it('should persist language to localStorage', async () => {
      const promise = service.switchLanguage('ms-MY');
      const req = httpMock.expectOne('/assets/i18n/ms-MY.json');
      req.flush({});
      await promise;

      expect(localStorage.getItem('chora-locale')).toBe('ms-MY');
    });

    it('should overwrite previous localStorage value', async () => {
      localStorage.setItem('chora-locale', 'en');

      const promise = service.switchLanguage('ta-IN');
      const req = httpMock.expectOne('/assets/i18n/ta-IN.json');
      req.flush({});
      await promise;

      expect(localStorage.getItem('chora-locale')).toBe('ta-IN');
    });
  });

  describe('initFromStorage', () => {
    it('should load language from localStorage', () => {
      localStorage.setItem('chora-locale', 'zh-CN');

      service.initFromStorage();
      const req = httpMock.expectOne('/assets/i18n/zh-CN.json');
      req.flush({});

      expect(service.currentLang()).toBe('zh-CN');
    });

    it('should fall back to en when localStorage is empty', () => {
      service.initFromStorage();
      const req = httpMock.expectOne('/assets/i18n/en.json');
      req.flush({});

      expect(service.currentLang()).toBe('en');
    });

    it('should fall back to en when stored locale is invalid', () => {
      localStorage.setItem('chora-locale', 'invalid-locale');

      service.initFromStorage();
      const req = httpMock.expectOne('/assets/i18n/en.json');
      req.flush({});

      expect(service.currentLang()).toBe('en');
    });

    it('should load ar-SA from storage with correct direction', () => {
      localStorage.setItem('chora-locale', 'ar-SA');

      service.initFromStorage();
      const req = httpMock.expectOne('/assets/i18n/ar-SA.json');
      req.flush({});

      expect(service.currentLang()).toBe('ar-SA');
      expect(service.direction()).toBe('rtl');
    });
  });
});
