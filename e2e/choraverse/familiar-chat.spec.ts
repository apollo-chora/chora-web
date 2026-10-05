import { test, expect } from '@playwright/test';
import { mockAuthSession } from '../fixtures/auth-mocks';
import {
  buildChatMessage,
  buildPersonaSnapshot,
  buildMemoryEntry,
  mockFamiliarChatHistory,
  mockFamiliarChatSend,
  mockFamiliarPersona,
  mockFamiliarMemory,
} from '../fixtures/wave4-bff-mocks';
import { FamiliarChatPage } from '../pages/familiar-chat.page';
import { runAxeAudit } from '../fixtures/a11y.fixture';

// ---------------------------------------------------------------------------
// Viewport: tablet primary (1024x768)
// ---------------------------------------------------------------------------
test.use({ viewport: { width: 1024, height: 768 } });

// ---------------------------------------------------------------------------
// Familiar Chat — Message List
// ---------------------------------------------------------------------------
test.describe('Familiar Chat — Messages', () => {
  let chatPage: FamiliarChatPage;

  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'learner', [
      'learner_engagement',
      'CHORAVERSE',
      'choraverse',
    ]);
    chatPage = new FamiliarChatPage(page);
  });

  test('chat message list renders with history', async ({ page }) => {
    const messages = [
      buildChatMessage({
        id: 'msg-1',
        role: 'learner',
        content: 'Can you help me understand algebra?',
      }),
      buildChatMessage({
        id: 'msg-2',
        role: 'familiar',
        content: 'Of course! Let me explain the basics of algebraic expressions.',
        citations: [{ atom_id: 'atom-1', title: 'Algebra Basics' }],
      }),
      buildChatMessage({
        id: 'msg-3',
        role: 'learner',
        content: 'What is a variable?',
      }),
    ];
    await mockFamiliarChatHistory(page, messages);
    await mockFamiliarChatSend(page);

    await chatPage.gotoChat();
    await chatPage.expectChatLoaded();
    await expect(chatPage.messageList).toBeVisible();
  });

  test('send message input and button are present', async ({ page }) => {
    await mockFamiliarChatHistory(page, []);
    await mockFamiliarChatSend(page);

    await chatPage.gotoChat();
    await chatPage.expectChatLoaded();

    await expect(chatPage.messageInput).toBeVisible();
    await expect(chatPage.sendBtn).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Familiar Chat — Persona
// ---------------------------------------------------------------------------
test.describe('Familiar Chat — Persona', () => {
  test('persona card renders with traits', async ({ page }) => {
    await mockAuthSession(page, 'learner', [
      'learner_engagement',
      'CHORAVERSE',
      'choraverse',
    ]);
    const persona = buildPersonaSnapshot({
      familiar_name: 'Spark',
      personality_traits: ['curious', 'encouraging', 'patient'],
      evolution_stage: 'adolescent',
    });
    await mockFamiliarPersona(page, persona);

    const chatPage = new FamiliarChatPage(page);
    await chatPage.gotoPersona();
    await chatPage.expectPersonaLoaded();

    await expect(chatPage.familiarName).toBeVisible();
    await expect(chatPage.traitsList).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Familiar Chat — Memory
// ---------------------------------------------------------------------------
test.describe('Familiar Chat — Memory', () => {
  test('memory panel displays entries', async ({ page }) => {
    await mockAuthSession(page, 'learner', [
      'learner_engagement',
      'CHORAVERSE',
      'choraverse',
    ]);
    const entries = [
      buildMemoryEntry({
        id: 'mem-1',
        category: 'learning_preference',
        content: 'Prefers visual explanations',
      }),
      buildMemoryEntry({
        id: 'mem-2',
        category: 'knowledge_gap',
        content: 'Struggles with quadratic equations',
      }),
    ];
    await mockFamiliarMemory(page, entries);

    const chatPage = new FamiliarChatPage(page);
    await chatPage.gotoMemory();
    await chatPage.expectMemoryLoaded();
    await expect(chatPage.memoryList).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Familiar Chat — Accessibility
// ---------------------------------------------------------------------------
test.describe('Familiar Chat — Accessibility', () => {
  test('chat page passes accessibility audit', async ({ page }) => {
    await mockAuthSession(page, 'learner', [
      'learner_engagement',
      'CHORAVERSE',
      'choraverse',
    ]);
    await mockFamiliarChatHistory(page, [
      buildChatMessage({ role: 'learner', content: 'Hello!' }),
      buildChatMessage({ role: 'familiar', content: 'Hi there!' }),
    ]);
    await mockFamiliarChatSend(page);

    const chatPage = new FamiliarChatPage(page);
    await chatPage.gotoChat();
    await chatPage.expectChatLoaded();

    await runAxeAudit(page, 'Familiar chat page');
  });
});
