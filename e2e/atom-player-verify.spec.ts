import { test, expect, Page } from '@playwright/test';

const GATEWAY = 'http://localhost:8000';
const APP = 'http://localhost:4200';

async function getToken(): Promise<string> {
  const res = await fetch(`${GATEWAY}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'daleleung76@gmail.com', password: 'password123' }),
  });
  const data = await res.json();
  return data.access_token;
}

async function setup(page: Page, token: string): Promise<void> {
  await page.route('**/api/v1/auth/token/refresh', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ access_token: token, token_type: 'Bearer', expires_in: 900 }),
    });
  });
}

test.describe('Atom Player Fix Verification', () => {
  let token: string;
  test.beforeAll(async () => { token = await getToken(); });

  test('MCQ: question shown, option click enables Submit, validation works', async ({ page }) => {
    await setup(page, token);
    await page.goto(`${APP}/learning/player/f0000000-0000-4000-a000-000000000001`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // Question text should now show (from 'question' field fallback)
    const stem = page.locator('[data-testid="mcq-stem"]');
    await expect(stem).toBeVisible();
    const stemText = await stem.textContent();
    console.log('MCQ stem:', stemText);
    expect(stemText).toContain('quadratic formula');

    // Click option 0 (the correct answer)
    const option0 = page.locator('[data-testid="mcq-option-0"]');
    await expect(option0).toBeVisible();
    await option0.click();
    await page.waitForTimeout(300);

    // Verify option is selected (● indicator)
    const indicator = await option0.locator('.mcq-renderer__option-indicator').textContent();
    console.log('Option 0 indicator after click:', indicator?.trim());
    expect(indicator?.trim()).toBe('●');

    // Submit should now be enabled
    const submitBtn = page.locator('[data-testid="submit-btn"]');
    await expect(submitBtn).toBeEnabled({ timeout: 2000 });
    console.log('Submit button enabled: YES');

    // Click Submit
    await submitBtn.click();
    await page.waitForTimeout(2000);

    // Should show feedback
    const feedback = page.locator('[data-testid="player-feedback"]');
    await expect(feedback).toBeVisible({ timeout: 5000 });
    const feedbackText = await feedback.textContent();
    console.log('Feedback:', feedbackText?.trim().slice(0, 200));

    await page.screenshot({ path: 'e2e/screenshots/verify-mcq-after-submit.png', fullPage: true });
  });

  test('True/False: question shown, selection enables Submit', async ({ page }) => {
    await setup(page, token);
    await page.goto(`${APP}/learning/player/f0000000-0000-4000-a000-000000000003`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // Question text visible
    const stem = page.locator('[data-testid="tf-stem"]');
    const stemText = await stem.textContent();
    console.log('T/F stem:', stemText);

    // Click True button
    const trueBtn = page.locator('[data-testid="tf-true-btn"]');
    await expect(trueBtn).toBeVisible();
    await trueBtn.click();
    await page.waitForTimeout(300);

    // Submit should be enabled
    const submitBtn = page.locator('[data-testid="submit-btn"]');
    await expect(submitBtn).toBeEnabled({ timeout: 2000 });
    console.log('T/F Submit enabled: YES');

    await submitBtn.click();
    await page.waitForTimeout(2000);

    const feedback = page.locator('[data-testid="player-feedback"]');
    await expect(feedback).toBeVisible({ timeout: 5000 });
    console.log('T/F Feedback visible: YES');
  });

  test('Fill Blank: question shown, typing enables Submit', async ({ page }) => {
    await setup(page, token);
    await page.goto(`${APP}/learning/player/f0000000-0000-4000-a000-000000000002`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // Question text
    const stem = page.locator('[data-testid="fill-blank-stem"]');
    const stemText = await stem.textContent();
    console.log('Fill blank stem:', stemText);
    expect(stemText).toContain('2x + 6');

    // Type answer in blank input
    const input = page.locator('[data-testid="fill-blank-input-0"]');
    await expect(input).toBeVisible();
    await input.fill('4');
    await page.waitForTimeout(300);

    // Submit should be enabled
    const submitBtn = page.locator('[data-testid="submit-btn"]');
    await expect(submitBtn).toBeEnabled({ timeout: 2000 });
    console.log('Fill blank Submit enabled: YES');

    await submitBtn.click();
    await page.waitForTimeout(2000);

    const feedback = page.locator('[data-testid="player-feedback"]');
    await expect(feedback).toBeVisible({ timeout: 5000 });
    const feedbackText = await feedback.textContent();
    console.log('Fill blank feedback:', feedbackText?.trim().slice(0, 200));
  });

  test('Short Answer: question now shown', async ({ page }) => {
    await setup(page, token);
    await page.goto(`${APP}/learning/player/f0000000-0000-4000-a000-000000000004`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    const stem = page.locator('[data-testid="short-answer-stem"]');
    const stemText = await stem.textContent();
    console.log('Short answer stem:', stemText);
    expect(stemText).toContain('area of a circle');
  });

  test('Code: question shown, typing enables Submit', async ({ page }) => {
    await setup(page, token);
    await page.goto(`${APP}/learning/player/f0000000-0000-4000-a000-000000000005`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    const stem = page.locator('[data-testid="code-stem"]');
    const stemText = await stem.textContent();
    console.log('Code stem:', stemText);

    // Type some code
    const editor = page.locator('[data-testid="code-editor"]');
    await expect(editor).toBeVisible();
    await editor.fill('def hello():\n    return "world"');
    await page.waitForTimeout(300);

    // Submit should be enabled
    const submitBtn = page.locator('[data-testid="submit-btn"]');
    await expect(submitBtn).toBeEnabled({ timeout: 2000 });
    console.log('Code Submit enabled: YES');
  });

  test('Matching: flashcard fallback shows content', async ({ page }) => {
    await setup(page, token);
    await page.goto(`${APP}/learning/player/f0000000-0000-4000-a000-000000000007`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // Flashcard should show the question
    const card = page.locator('[data-testid="flashcard-card"]');
    await expect(card).toBeVisible();
    const frontText = await card.textContent();
    console.log('Matching flashcard front:', frontText?.trim());

    // Click to flip
    await card.click();
    await page.waitForTimeout(500);
    const backText = await card.textContent();
    console.log('Matching flashcard back:', backText?.trim());

    await page.screenshot({ path: 'e2e/screenshots/verify-matching-flashcard.png', fullPage: true });
  });

  test('Ordering: flashcard fallback shows content', async ({ page }) => {
    await setup(page, token);
    await page.goto(`${APP}/learning/player/f0000000-0000-4000-a000-000000000008`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    const card = page.locator('[data-testid="flashcard-card"]');
    await expect(card).toBeVisible();
    const frontText = await card.textContent();
    console.log('Ordering flashcard front:', frontText?.trim());

    await card.click();
    await page.waitForTimeout(500);
    const backText = await card.textContent();
    console.log('Ordering flashcard back:', backText?.trim());
  });
});
