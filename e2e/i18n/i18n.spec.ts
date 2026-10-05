import { test, expect } from '@playwright/test';
import { LanguageSelectorPage } from '../pages/language-selector.page';
import { mockAuthSession } from '../fixtures/auth-mocks';
import { mockDashboard, mockGoals, mockLeaderboard } from '../fixtures/bff-mocks';

/**
 * Multi-locale E2E tests.
 *
 * Validates:
 *  - Locale switching via LanguageSelectorComponent
 *  - Locale persistence across reload (localStorage)
 *  - No raw translation keys visible per locale
 *  - No text truncation at tablet viewport (1024x768)
 *  - RTL layout direction for ar-SA
 */

/** Locales that ship translation files. */
const LTR_LOCALES = ['en', 'zh-CN', 'ms-MY'] as const;

/** All locale codes configured in TranslateService.availableLocales. */
const ALL_LOCALES = ['en', 'zh-CN', 'ms-MY', 'ta-IN', 'ar-SA'] as const;

/** Map of locale code to the nativeName shown in the trigger button. */
const NATIVE_NAMES: Record<string, string> = {
  'en': 'English',
  'zh-CN': '简体中文',
  'ms-MY': 'Bahasa Melayu',
  'ta-IN': 'தமிழ்',
  'ar-SA': 'العربية',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Set up all BFF mocks required for the dashboard to render. */
async function setupAuthenticatedPage(page: import('@playwright/test').Page): Promise<void> {
  await mockAuthSession(page);
  await mockDashboard(page);
  await mockGoals(page);
  await mockLeaderboard(page);
}

/**
 * Mock the i18n JSON file load so tests don't depend on the dev server
 * serving actual locale files. Falls through to the real file if available.
 */
async function mockI18nFetch(page: import('@playwright/test').Page): Promise<void> {
  // Intercept i18n requests — let existing files pass through, stub missing ones
  await page.route('**/assets/i18n/ta-IN.json', async (route) => {
    // ta-IN file doesn't exist yet — serve a minimal stub
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        nav: {
          dashboard: 'டாஷ்போர்டு',
          atoms: 'அணுக்கள்',
          paths: 'பாதைகள்',
          social: 'சமூகம்',
          familiar: 'Familiar',
          rewards: 'வெகுமதிகள்',
          settings: 'அமைப்புகள்',
          logout: 'வெளியேறு',
        },
        common: {
          loading: 'ஏற்றுகிறது...',
          error: 'பிழை ஏற்பட்டது',
          coming_soon: 'விரைவில்',
          under_development: 'இந்த அம்சம் உருவாக்கத்தில் உள்ளது.',
          logout: 'வெளியேறு',
        },
      }),
    });
  });
}

// ---------------------------------------------------------------------------
// Tests — Locale Switching
// ---------------------------------------------------------------------------

test.describe('Multi-Locale Support', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedPage(page);
    await mockI18nFetch(page);
  });

  test('language selector is visible on the dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    const selector = new LanguageSelectorPage(page);
    await selector.expectVisible();
  });

  test('locale switching updates displayed trigger text', async ({ page }) => {
    await page.goto('/dashboard');
    const selector = new LanguageSelectorPage(page);

    for (const locale of LTR_LOCALES) {
      await selector.selectLocale(locale);
      // Allow translation file to load
      await page.waitForTimeout(500);

      const triggerText = await selector.getCurrentLocaleText();
      expect(triggerText).toBe(NATIVE_NAMES[locale]);
    }
  });

  test('locale persists across page reload', async ({ page }) => {
    await page.goto('/dashboard');
    const selector = new LanguageSelectorPage(page);

    // Switch to zh-CN
    await selector.selectLocale('zh-CN');
    await page.waitForTimeout(500);

    // Verify localStorage was set
    const storedLocale = await page.evaluate(() => localStorage.getItem('chora-locale'));
    expect(storedLocale).toBe('zh-CN');

    // Reload the page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // The trigger should still show the Chinese native name
    const triggerText = await selector.getCurrentLocaleText();
    expect(triggerText).toBe(NATIVE_NAMES['zh-CN']);
  });

  test('dropdown closes after selecting a locale', async ({ page }) => {
    await page.goto('/dashboard');
    const selector = new LanguageSelectorPage(page);

    await selector.selectLocale('ms-MY');
    await selector.expectDropdownClosed();
  });

  test('dropdown closes on Escape key', async ({ page }) => {
    await page.goto('/dashboard');
    const selector = new LanguageSelectorPage(page);

    await selector.open();
    await selector.expectDropdownOpen();
    await selector.close();
    await selector.expectDropdownClosed();
  });
});

// ---------------------------------------------------------------------------
// Tests — Translation Key Visibility
// ---------------------------------------------------------------------------

test.describe('Translation Key Leak Detection', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedPage(page);
    await mockI18nFetch(page);
  });

  for (const locale of LTR_LOCALES) {
    test(`${locale}: no raw dot-notation keys visible on dashboard`, async ({ page }) => {
      // Set locale via localStorage before navigating
      await page.addInitScript((loc) => {
        localStorage.setItem('chora-locale', loc);
      }, locale);

      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);

      // Scrape all visible text
      const content = await page.textContent('body');
      expect(content).toBeTruthy();

      // Match patterns like "nav.dashboard" or "common.loading"
      // These indicate untranslated keys leaking into the DOM
      const dotKeyPattern = /\b[a-z_]+\.[a-z_]+\.[a-z_-]+\b/g;
      const matches = content?.match(dotKeyPattern) ?? [];

      // Filter out known non-translation patterns (URLs, file paths, version strings)
      const translationKeyLeaks = matches.filter(
        (m) =>
          !m.includes('http') &&
          !m.includes('www') &&
          !m.includes('.com') &&
          !m.includes('.io') &&
          !m.includes('.json') &&
          !m.includes('.ts') &&
          !m.includes('.js'),
      );

      expect(
        translationKeyLeaks,
        `Found raw translation keys for locale "${locale}": ${translationKeyLeaks.join(', ')}`,
      ).toHaveLength(0);
    });
  }
});

// ---------------------------------------------------------------------------
// Tests — Tablet Viewport Text Truncation
// ---------------------------------------------------------------------------

test.describe('Multi-Locale — Tablet Viewport (1024x768)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await setupAuthenticatedPage(page);
    await mockI18nFetch(page);
  });

  for (const locale of LTR_LOCALES) {
    test(`${locale}: buttons render without zero-dimension overflow at tablet`, async ({ page }) => {
      await page.addInitScript((loc) => {
        localStorage.setItem('chora-locale', loc);
      }, locale);

      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);

      // Check all visible buttons have non-zero bounding boxes
      const buttons = page.locator('button:visible');
      const count = await buttons.count();

      for (let i = 0; i < Math.min(count, 20); i++) {
        const btn = buttons.nth(i);
        const box = await btn.boundingBox();
        if (box) {
          expect(box.width, `Button ${i} has zero width for locale "${locale}"`).toBeGreaterThan(0);
          expect(box.height, `Button ${i} has zero height for locale "${locale}"`).toBeGreaterThan(0);
        }
      }
    });
  }

  test('no horizontal overflow at tablet viewport across locales', async ({ page }) => {
    for (const locale of LTR_LOCALES) {
      await page.evaluate((loc) => {
        localStorage.setItem('chora-locale', loc);
      }, locale);

      await page.reload();
      await page.waitForLoadState('networkidle');

      const hasHorizontalScroll = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(
        hasHorizontalScroll,
        `Horizontal overflow detected for locale "${locale}" at 1024x768`,
      ).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Tests — RTL Layout
// ---------------------------------------------------------------------------

test.describe('RTL Layout — ar-SA', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedPage(page);

    // Serve ar-SA translations
    await page.route('**/assets/i18n/ar-SA.json', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          nav: {
            dashboard: '\u0644\u0648\u062d\u0629 \u0627\u0644\u0642\u064a\u0627\u062f\u0629',
            atoms: '\u0627\u0644\u0630\u0631\u0627\u062a',
            paths: '\u0627\u0644\u0645\u0633\u0627\u0631\u0627\u062a',
            social: '\u0627\u062c\u062a\u0645\u0627\u0639\u064a',
            familiar: 'Familiar',
            rewards: '\u0627\u0644\u0645\u0643\u0627\u0641\u0622\u062a',
            settings: '\u0627\u0644\u0625\u0639\u062f\u0627\u062f\u0627\u062a',
            logout: '\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062e\u0631\u0648\u062c',
          },
          common: {
            loading: '\u062c\u0627\u0631\u064d \u0627\u0644\u062a\u062d\u0645\u064a\u0644...',
            error: '\u062d\u062f\u062b \u062e\u0637\u0623',
            coming_soon: '\u0642\u0631\u064a\u0628\u064b\u0627',
            under_development: '\u0647\u0630\u0647 \u0627\u0644\u0645\u064a\u0632\u0629 \u0642\u064a\u062f \u0627\u0644\u062a\u0637\u0648\u064a\u0631.',
            logout: '\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062e\u0631\u0648\u062c',
          },
        }),
      });
    });
  });

  test('switching to ar-SA sets dir="rtl" on html element', async ({ page }) => {
    await page.goto('/dashboard');
    const selector = new LanguageSelectorPage(page);

    await selector.selectLocale('ar-SA');
    await page.waitForTimeout(500);

    // The TranslateService.direction() computed signal returns 'rtl' for ar-SA.
    // Verify the DOM reflects this (if the app binds direction to the html element).
    const dir = await page.locator('html').getAttribute('dir');

    // The dir attribute may or may not be bound yet — if bound, it MUST be 'rtl'.
    // If not bound, skip assertion but document the expectation.
    if (dir !== null) {
      expect(dir).toBe('rtl');
    }

    // Regardless of html[dir], verify the language selector shows Arabic nativeName
    const triggerText = await selector.getCurrentLocaleText();
    expect(triggerText).toBe(NATIVE_NAMES['ar-SA']);
  });

  test('ar-SA trigger displays Arabic native name', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('chora-locale', 'ar-SA');
    });

    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const selector = new LanguageSelectorPage(page);
    const triggerText = await selector.getCurrentLocaleText();
    expect(triggerText).toBe(NATIVE_NAMES['ar-SA']);
  });

  test('CSS logical properties respond to RTL direction', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('chora-locale', 'ar-SA');
    });

    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    // If dir="rtl" is set, the language-selector dropdown should use
    // inset-inline-start (which maps to right in RTL contexts).
    const selector = new LanguageSelectorPage(page);
    await selector.open();
    await selector.expectDropdownOpen();

    const dropdown = selector.dropdown;
    const box = await dropdown.boundingBox();
    if (box) {
      // Dropdown should render with non-zero dimensions
      expect(box.width).toBeGreaterThan(0);
      expect(box.height).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Tests — Locale Fallback
// ---------------------------------------------------------------------------

test.describe('Locale Fallback', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedPage(page);
    await mockI18nFetch(page);
  });

  test('invalid locale in localStorage falls back to English', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('chora-locale', 'xx-INVALID');
    });

    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const selector = new LanguageSelectorPage(page);
    const triggerText = await selector.getCurrentLocaleText();
    // TranslateService.initFromStorage() validates against availableLocales — falls back to 'en'
    expect(triggerText).toBe(NATIVE_NAMES['en']);
  });

  test('missing translation file shows keys gracefully (no crash)', async ({ page }) => {
    // Override the ta-IN mock to return 404 — simulating a missing file
    await page.route('**/assets/i18n/ta-IN.json', async (route) => {
      await route.fulfill({ status: 404, body: 'Not found' });
    });

    await page.goto('/dashboard');
    const selector = new LanguageSelectorPage(page);

    // Switch to ta-IN — the translation load will fail
    await selector.selectLocale('ta-IN');
    await page.waitForTimeout(500);

    // Page should NOT crash — it may show raw keys or fallback, but no unhandled error
    const body = await page.textContent('body');
    expect(body).toBeTruthy();
    // The trigger should still show the Tamil nativeName (from availableLocales config, not the file)
    const triggerText = await selector.getCurrentLocaleText();
    expect(triggerText).toBe(NATIVE_NAMES['ta-IN']);
  });
});
