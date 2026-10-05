import { type Locator, type Page, expect } from '@playwright/test';

export class FamiliarChatPage {
  readonly page: Page;

  // Chat
  readonly chatContainer: Locator;
  readonly messageList: Locator;
  readonly messageInput: Locator;
  readonly sendBtn: Locator;

  // Persona card
  readonly personaCard: Locator;
  readonly familiarName: Locator;
  readonly traitsList: Locator;

  // Memory panel
  readonly memoryPanel: Locator;
  readonly memoryList: Locator;

  constructor(page: Page) {
    this.page = page;

    this.chatContainer = page.locator('[data-testid="familiar-chat"]');
    this.messageList = page.locator('[data-testid="message-list"]');
    this.messageInput = page.locator('[data-testid="message-input"]');
    this.sendBtn = page.locator('[data-testid="btn-send-message"]');

    this.personaCard = page.locator('[data-testid="familiar-persona-card"]');
    this.familiarName = page.locator('[data-testid="familiar-name"]');
    this.traitsList = page.locator('[data-testid="traits-list"]');

    this.memoryPanel = page.locator('[data-testid="familiar-memory-panel"]');
    this.memoryList = page.locator('[data-testid="memory-list"]');
  }

  async gotoChat(): Promise<this> {
    await this.page.goto('/choraverse/chat');
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async gotoPersona(): Promise<this> {
    await this.page.goto('/choraverse/persona');
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async gotoMemory(): Promise<this> {
    await this.page.goto('/choraverse/memory');
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async expectChatLoaded(): Promise<this> {
    await expect(this.chatContainer).toBeVisible();
    return this;
  }

  async expectPersonaLoaded(): Promise<this> {
    await expect(this.personaCard).toBeVisible();
    return this;
  }

  async expectMemoryLoaded(): Promise<this> {
    await expect(this.memoryPanel).toBeVisible();
    return this;
  }

  async getMessageCount(): Promise<number> {
    return this.messageList.locator('[data-testid^="chat-message"]').count();
  }

  async typeMessage(text: string): Promise<this> {
    await this.messageInput.fill(text);
    return this;
  }

  async getMemoryEntryCount(): Promise<number> {
    return this.memoryList.locator('[data-testid^="memory-entry"]').count();
  }

  async getTraitCount(): Promise<number> {
    return this.traitsList.locator('[data-testid^="trait-"]').count();
  }
}
