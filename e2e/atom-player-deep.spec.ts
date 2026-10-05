import { test, expect, Page, Response } from '@playwright/test';

const GATEWAY = 'http://localhost:8000';
const APP = 'http://localhost:4200';

async function loginAndGetToken(): Promise<string> {
  const res = await fetch(`${GATEWAY}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'daleleung76@gmail.com', password: 'password123' }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Login failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function injectAuth(page: Page, token: string): Promise<void> {
  await page.route('**/api/v1/auth/token/refresh', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ access_token: token, token_type: 'Bearer', expires_in: 900 }),
    });
  });
}

interface NetworkLog {
  url: string;
  status: number;
  method: string;
  body?: unknown;
}

function attachNetworkLogger(page: Page): NetworkLog[] {
  const logs: NetworkLog[] = [];
  page.on('response', async (response: Response) => {
    const url = response.url();
    if (url.includes('/api/')) {
      let body: unknown;
      try { body = await response.json(); } catch { body = '(not json)'; }
      logs.push({
        url: url.replace(APP, '').replace(GATEWAY, ''),
        status: response.status(),
        method: response.request().method(),
        body,
      });
    }
  });
  return logs;
}

function attachConsoleLogger(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

// Known atom IDs from seed data
const ATOMS = [
  { id: 'f0000000-0000-4000-a000-000000000001', type: 'multiple_choice', label: 'Quadratic Formula MCQ' },
  { id: 'f0000000-0000-4000-a000-000000000002', type: 'fill_blank', label: 'Linear Equation Fill Blank' },
  { id: 'f0000000-0000-4000-a000-000000000003', type: 'true_false', label: 'Triangles True/False' },
  { id: 'f0000000-0000-4000-a000-000000000004', type: 'short_answer', label: 'Circle Area Short Answer' },
  { id: 'f0000000-0000-4000-a000-000000000005', type: 'code', label: 'Python Functions Code' },
  { id: 'f0000000-0000-4000-a000-000000000006', type: 'multiple_choice', label: 'Python Variable MCQ' },
  { id: 'f0000000-0000-4000-a000-000000000007', type: 'matching', label: 'Notation Matching' },
  { id: 'f0000000-0000-4000-a000-000000000008', type: 'ordering', label: 'Sequences Ordering' },
  { id: 'f0000000-0000-4000-a000-000000000009', type: 'essay', label: 'Algorithms Essay' },
  { id: 'f0000000-0000-4000-a000-000000000010', type: 'multimedia', label: 'Intro Multimedia (draft)' },
];

test.describe('Atom Player — Click Every Answer Type', () => {
  let token: string;

  test.beforeAll(async () => {
    token = await loginAndGetToken();
  });

  for (const atom of ATOMS) {
    test(`${atom.type}: ${atom.label}`, async ({ page }) => {
      const network = attachNetworkLogger(page);
      const consoleErrors = attachConsoleLogger(page);
      await injectAuth(page, token);

      // Navigate directly to the atom player
      await page.goto(`${APP}/learning/player/${atom.id}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);

      // Screenshot initial state
      await page.screenshot({ path: `e2e/screenshots/player-${atom.type}-${atom.id.slice(-4)}.png`, fullPage: true });

      // Get all visible text
      const pageText = await page.evaluate(() => document.body?.innerText ?? '');
      console.log(`\n=== ${atom.type.toUpperCase()}: ${atom.label} ===`);
      console.log('URL:', page.url());
      console.log('Page text (first 600 chars):', pageText.slice(0, 600));

      // Check for "not available" or error states
      const hasNotAvailable = pageText.includes('not available') || pageText.includes('Not available');
      const hasError = pageText.toLowerCase().includes('error') || pageText.toLowerCase().includes('could not');
      if (hasNotAvailable) console.log('⚠ ATOM NOT AVAILABLE');
      if (hasError) console.log('⚠ ERROR STATE DETECTED');

      // Find all interactive elements in the player
      const buttons = await page.locator('button:visible').allTextContents();
      console.log('Visible buttons:', buttons.map(b => b.trim()).filter(Boolean));

      const inputs = await page.locator('input:visible, textarea:visible, select:visible').count();
      console.log('Visible inputs:', inputs);

      // Find all clickable answer options
      const options = await page.locator('[data-testid*="option"], [data-testid*="answer"], [role="radio"], [role="checkbox"], [class*="option"], [class*="answer"], [class*="choice"]').all();
      console.log('Answer options found:', options.length);

      // Try to interact with answer UI based on type
      switch (atom.type) {
        case 'multiple_choice': {
          // Click first option
          const mcqOptions = await page.locator('[data-testid*="option"], [role="radio"], [class*="option"], [class*="choice"], button[class*="mcq"], label[class*="option"]').all();
          console.log('MCQ options:', mcqOptions.length);
          for (let i = 0; i < mcqOptions.length; i++) {
            const text = (await mcqOptions[i].textContent())?.trim();
            const visible = await mcqOptions[i].isVisible().catch(() => false);
            console.log(`  Option ${i}: "${text?.slice(0, 80)}" visible=${visible}`);
          }
          if (mcqOptions.length > 0) {
            const firstVisible = mcqOptions.find(async o => await o.isVisible().catch(() => false));
            if (firstVisible) {
              console.log('Clicking first MCQ option...');
              await firstVisible.click().catch(e => console.log('Click failed:', e.message));
              await page.waitForTimeout(500);
            }
          }
          break;
        }
        case 'fill_blank': {
          const blankInputs = await page.locator('input[type="text"]:visible, input:not([type]):visible, [data-testid*="blank"], [class*="blank"] input').all();
          console.log('Fill-blank inputs:', blankInputs.length);
          if (blankInputs.length > 0) {
            console.log('Typing answer "4" into first blank...');
            await blankInputs[0].fill('4').catch(e => console.log('Fill failed:', e.message));
            await page.waitForTimeout(500);
          }
          break;
        }
        case 'true_false': {
          const tfOptions = await page.locator('button:has-text("True"), button:has-text("False"), [data-testid*="true"], [data-testid*="false"], [class*="true-false"] button').all();
          console.log('True/False options:', tfOptions.length);
          for (const opt of tfOptions) {
            const text = (await opt.textContent())?.trim();
            console.log(`  T/F option: "${text}"`);
          }
          if (tfOptions.length > 0) {
            console.log('Clicking True...');
            await tfOptions[0].click().catch(e => console.log('Click failed:', e.message));
            await page.waitForTimeout(500);
          }
          break;
        }
        case 'short_answer': {
          const saInputs = await page.locator('input:visible, textarea:visible').all();
          console.log('Short answer inputs:', saInputs.length);
          if (saInputs.length > 0) {
            console.log('Typing answer...');
            await saInputs[0].fill('78.54').catch(e => console.log('Fill failed:', e.message));
            await page.waitForTimeout(500);
          }
          break;
        }
        case 'code': {
          const codeArea = await page.locator('textarea:visible, [class*="code-editor"], [class*="monaco"], [data-testid*="code"]').all();
          console.log('Code areas:', codeArea.length);
          break;
        }
        case 'matching': {
          const matchItems = await page.locator('[class*="match"], [data-testid*="match"], [class*="pair"], [draggable="true"]').all();
          console.log('Matching items:', matchItems.length);
          for (const item of matchItems) {
            const text = (await item.textContent())?.trim();
            console.log(`  Match item: "${text?.slice(0, 60)}"`);
          }
          break;
        }
        case 'ordering': {
          const orderItems = await page.locator('[class*="order"], [data-testid*="order"], [draggable="true"], [class*="sortable"]').all();
          console.log('Ordering items:', orderItems.length);
          for (const item of orderItems) {
            const text = (await item.textContent())?.trim();
            console.log(`  Order item: "${text?.slice(0, 60)}"`);
          }
          break;
        }
        case 'essay': {
          const essayArea = await page.locator('textarea:visible, [contenteditable="true"]').all();
          console.log('Essay areas:', essayArea.length);
          if (essayArea.length > 0) {
            console.log('Typing essay...');
            await essayArea[0].fill('Big-O notation describes...').catch(e => console.log('Fill failed:', e.message));
            await page.waitForTimeout(500);
          }
          break;
        }
        case 'multimedia': {
          const mediaEl = await page.locator('video, audio, img[class*="media"], [class*="media-player"]').all();
          console.log('Media elements:', mediaEl.length);
          break;
        }
      }

      // Try clicking Submit
      const submitBtn = page.locator('button:has-text("Submit"), button:has-text("Check"), [data-testid*="submit"], [data-testid*="check"]').first();
      if (await submitBtn.isVisible().catch(() => false)) {
        console.log('Clicking Submit button...');
        await submitBtn.click().catch(e => console.log('Submit click failed:', e.message));
        await page.waitForTimeout(1500);

        // Check result after submission
        const afterText = await page.evaluate(() => document.body?.innerText ?? '');
        const hasCorrect = afterText.toLowerCase().includes('correct');
        const hasIncorrect = afterText.toLowerCase().includes('incorrect');
        const hasValidationError = afterText.toLowerCase().includes('could not validate') || afterText.toLowerCase().includes('validation failed');
        console.log('After submit — correct:', hasCorrect, 'incorrect:', hasIncorrect, 'validation error:', hasValidationError);

        await page.screenshot({ path: `e2e/screenshots/player-${atom.type}-${atom.id.slice(-4)}-after.png`, fullPage: true });
      } else {
        console.log('No Submit button visible');
      }

      // Log API calls
      const apiCalls = network.filter(n => n.url.includes('/api/'));
      if (apiCalls.length > 0) {
        console.log('\nAPI calls:');
        for (const call of apiCalls) {
          const preview = typeof call.body === 'object' ? JSON.stringify(call.body).slice(0, 200) : '';
          console.log(`  ${call.method} ${call.url} → ${call.status} ${preview}`);
        }
      }

      // Log console errors
      if (consoleErrors.length > 0) {
        console.log('\nConsole errors:');
        for (const e of consoleErrors) {
          console.log(`  ${e.slice(0, 300)}`);
        }
      }
    });
  }
});
