import { type Locator, type Page, expect } from '@playwright/test';

/**
 * Page Object Model for the admin topic tree page.
 * Route: /admin/content/topics
 */
export class AdminTopicTreePage {
  readonly page: Page;
  readonly container: Locator;
  readonly title: Locator;
  readonly createRootButton: Locator;
  readonly atomPickerToggle: Locator;
  readonly loadingState: Locator;
  readonly emptyState: Locator;
  readonly treePanel: Locator;
  readonly atomPickerPanel: Locator;
  readonly atomSearchInput: Locator;

  // Create form
  readonly createForm: Locator;
  readonly newTopicNameInput: Locator;
  readonly newTopicParentSelect: Locator;
  readonly submitCreateButton: Locator;
  readonly cancelCreateButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.container = page.locator('[data-testid="topic-tree"]');
    this.title = page.locator('[data-testid="topic-tree-title"]');
    this.createRootButton = page.locator('[data-testid="create-root-topic"]');
    this.atomPickerToggle = page.locator('[data-testid="toggle-atom-picker"]');
    this.loadingState = page.locator('[data-testid="topic-tree-loading"]');
    this.emptyState = page.locator('[data-testid="topic-tree-empty"]');
    this.treePanel = page.locator('[data-testid="tree-panel"]');
    this.atomPickerPanel = page.locator('[data-testid="atom-picker-panel"]');
    this.atomSearchInput = page.locator('[data-testid="atom-search"]');

    // Create form
    this.createForm = page.locator('[data-testid="create-topic-form"]');
    this.newTopicNameInput = page.locator('[data-testid="new-topic-name"]');
    this.newTopicParentSelect = page.locator('[data-testid="new-topic-parent"]');
    this.submitCreateButton = page.locator('[data-testid="submit-create"]');
    this.cancelCreateButton = page.locator('[data-testid="cancel-create"]');
  }

  async goto(): Promise<this> {
    await this.page.goto('/admin/content/topics');
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async expectLoaded(): Promise<this> {
    await expect(this.container).toBeVisible();
    await expect(this.treePanel).toBeVisible();
    return this;
  }

  async expectEmpty(): Promise<this> {
    await expect(this.emptyState).toBeVisible();
    return this;
  }

  async openCreateForm(): Promise<this> {
    await this.createRootButton.click();
    await expect(this.createForm).toBeVisible();
    return this;
  }

  async fillTopicName(name: string): Promise<this> {
    await this.newTopicNameInput.fill(name);
    return this;
  }

  async submitCreate(): Promise<this> {
    await this.submitCreateButton.click();
    return this;
  }

  async cancelCreate(): Promise<this> {
    await this.cancelCreateButton.click();
    return this;
  }

  // Node interactions
  getNode(nodeId: string): Locator {
    return this.page.locator(`[data-testid="topic-node-${nodeId}"]`);
  }

  getNodeName(nodeId: string): Locator {
    return this.page.locator(`[data-testid="node-name-${nodeId}"]`);
  }

  getRenameInput(nodeId: string): Locator {
    return this.page.locator(`[data-testid="rename-input-${nodeId}"]`);
  }

  getToggle(nodeId: string): Locator {
    return this.page.locator(`[data-testid="toggle-${nodeId}"]`);
  }

  getDeleteButton(nodeId: string): Locator {
    return this.page.locator(`[data-testid="delete-${nodeId}"]`);
  }

  getAddChildButton(nodeId: string): Locator {
    return this.page.locator(`[data-testid="add-child-${nodeId}"]`);
  }

  getAtomCount(nodeId: string): Locator {
    return this.page.locator(`[data-testid="atom-count-${nodeId}"]`);
  }

  async startRename(nodeId: string): Promise<this> {
    await this.getNodeName(nodeId).dblclick();
    return this;
  }

  async rename(nodeId: string, newName: string): Promise<this> {
    await this.startRename(nodeId);
    const input = this.getRenameInput(nodeId);
    await expect(input).toBeVisible();
    await input.fill(newName);
    await input.press('Enter');
    return this;
  }

  async expand(nodeId: string): Promise<this> {
    await this.getToggle(nodeId).click();
    return this;
  }

  async collapse(nodeId: string): Promise<this> {
    await this.getToggle(nodeId).click();
    return this;
  }

  async deleteNode(nodeId: string): Promise<this> {
    await this.getDeleteButton(nodeId).click();
    return this;
  }

  async addChild(nodeId: string): Promise<this> {
    await this.getAddChildButton(nodeId).click();
    return this;
  }
}
