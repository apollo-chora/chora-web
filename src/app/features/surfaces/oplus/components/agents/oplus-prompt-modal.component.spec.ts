import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { OplusPromptModalComponent } from './oplus-prompt-modal.component';
import { TranslateService } from '../../../../../core/services/translate.service';
import { GovernanceService } from '../../../../../core/services/governance.service';
import {
  GovernanceServiceStub,
  FIXTURE_PROMPT_CATALOGUE_LIST,
} from '../../testing/governance.fixtures';

describe('OplusPromptModalComponent (CHO-2368 prompt catalogue dialog)', () => {
  let fixture: ComponentFixture<OplusPromptModalComponent>;
  let element: HTMLElement;
  let stub: GovernanceServiceStub;

  async function setup(inputs: { agentId: string; initialVersion?: string }): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [OplusPromptModalComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        TranslateService,
        { provide: GovernanceService, useValue: stub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OplusPromptModalComponent);
    fixture.componentRef.setInput('agentId', inputs.agentId);
    if (inputs.initialVersion !== undefined) {
      fixture.componentRef.setInput('initialVersion', inputs.initialVersion);
    }
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(() => {
    stub = new GovernanceServiceStub();
  });

  it('renders an accessible dialog with focus on the panel', async () => {
    await setup({ agentId: 'qgen_question' });
    const dialog = element.querySelector('[data-testid="oplus-prompt-modal"]');
    expect(dialog).toBeTruthy();
    expect(dialog?.getAttribute('role')).toBe('dialog');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.getAttribute('aria-labelledby')).toBe('oplus-prompt-modal-title');
  });

  it('fetches the version list and preselects the initial version', async () => {
    await setup({ agentId: 'qgen_question', initialVersion: 'v1' });
    expect(stub.promptCatalogueCalls[0]).toEqual({ agentId: 'qgen_question' });
    expect(stub.promptCatalogueCalls[1]).toEqual({ agentId: 'qgen_question', version: 'v1' });
    const select = element.querySelector<HTMLSelectElement>(
      '[data-testid="oplus-prompt-modal-version-select"]',
    );
    expect(select).toBeTruthy();
    expect(select?.options.length).toBe(2);
  });

  it('defaults to the newest ACTIVE version when no initial version is given', async () => {
    await setup({ agentId: 'qgen_question' });
    // Both fixture versions are active; the newest (1.1.0, last row) wins.
    expect(stub.promptCatalogueCalls[1]).toEqual({
      agentId: 'qgen_question',
      version: '1.1.0',
    });
  });

  it('renders segments in order with the locked badge on locked segments', async () => {
    await setup({ agentId: 'qgen_question', initialVersion: 'v1' });
    const segments = Array.from(
      element.querySelectorAll('[data-testid^="oplus-prompt-segment-"]'),
    );
    expect(segments.map((s) => s.getAttribute('data-testid'))).toEqual([
      'oplus-prompt-segment-role',
      'oplus-prompt-segment-output_new_mcq',
    ]);
    expect(
      element.querySelector('[data-testid="oplus-prompt-locked-role"]'),
    ).toBeNull();
    expect(
      element.querySelector('[data-testid="oplus-prompt-locked-output_new_mcq"]'),
    ).toBeTruthy();
    const body = element.querySelector(
      '[data-testid="oplus-prompt-segment-role"] .oplus-prompt-modal__segment-body',
    );
    expect(body?.textContent).toContain('Generation sub-agent');
  });

  it('refetches content when the version selector changes', async () => {
    await setup({ agentId: 'qgen_question', initialVersion: 'v1' });
    const select = element.querySelector<HTMLSelectElement>(
      '[data-testid="oplus-prompt-modal-version-select"]',
    );
    expect(select).toBeTruthy();
    select!.value = '1.1.0';
    select!.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(stub.promptCatalogueCalls.at(-1)).toEqual({
      agentId: 'qgen_question',
      version: '1.1.0',
    });
  });

  it('shows the error branch with a retry CTA when the list fetch fails', async () => {
    stub.promptCatalogueListError = new Error('boom');
    await setup({ agentId: 'qgen_question' });
    expect(
      element.querySelector('[data-testid="oplus-prompt-modal-error"]'),
    ).toBeTruthy();
    stub.promptCatalogueListError = null;
    stub.promptCatalogueCalls = [];
    const retry = element.querySelector<HTMLButtonElement>(
      '[data-testid="oplus-prompt-modal-retry"]',
    );
    retry?.click();
    fixture.detectChanges();
    expect(stub.promptCatalogueCalls.length).toBeGreaterThan(0);
  });

  it('shows the forbidden branch on a 403', async () => {
    stub.promptCatalogueListError = { status: 403 };
    await setup({ agentId: 'qgen_question' });
    expect(
      element.querySelector('[data-testid="oplus-prompt-modal-forbidden"]'),
    ).toBeTruthy();
  });

  it('emits dismissed on Escape and on backdrop click', async () => {
    await setup({ agentId: 'qgen_question' });
    let dismissed = 0;
    fixture.componentInstance.dismissed.subscribe(() => {
      dismissed += 1;
    });
    const backdrop = element.querySelector<HTMLElement>(
      '[data-testid="oplus-prompt-modal-backdrop"]',
    );
    backdrop?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(dismissed).toBe(1);
    backdrop?.click();
    fixture.detectChanges();
    expect(dismissed).toBe(2);
  });

  it('close button emits dismissed', async () => {
    await setup({ agentId: 'qgen_question' });
    let dismissed = 0;
    fixture.componentInstance.dismissed.subscribe(() => {
      dismissed += 1;
    });
    element
      .querySelector<HTMLButtonElement>('[data-testid="oplus-prompt-modal-close"]')
      ?.click();
    expect(dismissed).toBe(1);
  });

  // ── CHO-2379: plain status copy (the 'override' word carries no meaning) ──
  //
  // No translations are loaded under test, so the pipe emits the raw key. That
  // makes the key itself the assertion surface: the ABSENCE of
  // prompt_modal_kind_override proves the word is gone from the rendered copy.

  it('labels an override option with a plain status and no kind word', async () => {
    await setup({ agentId: 'qgen_question' });
    const select = element.querySelector<HTMLSelectElement>(
      '[data-testid="oplus-prompt-modal-version-select"]',
    );
    const override = Array.from(select!.options).find((o) => o.value === '1.1.0');
    expect(override?.textContent).toContain('1.1.0');
    expect(override?.textContent).toContain('oplus.agents.prompt_modal_status_active');
    expect(override?.textContent).not.toContain('prompt_modal_kind_');
  });

  it('keeps the baseline tag on the baseline option', async () => {
    await setup({ agentId: 'qgen_question' });
    const select = element.querySelector<HTMLSelectElement>(
      '[data-testid="oplus-prompt-modal-version-select"]',
    );
    const baseline = Array.from(select!.options).find((o) => o.value === 'v1');
    expect(baseline?.textContent).toContain('v1');
    expect(baseline?.textContent).toContain('oplus.agents.prompt_modal_kind_baseline');
  });

  it('never renders the override word anywhere in the version selector', async () => {
    await setup({ agentId: 'qgen_question' });
    const select = element.querySelector('[data-testid="oplus-prompt-modal-version-select"]');
    expect(select?.textContent).not.toContain('prompt_modal_kind_override');
  });

  it('renders a plain status badge in the meta for an override version', async () => {
    stub.promptCatalogueDetailResult = {
      ...stub.promptCatalogueDetailResult,
      version: '1.1.0',
      kind: 'override',
      status: 'active',
    };
    await setup({ agentId: 'qgen_question', initialVersion: '1.1.0' });
    const meta = element.querySelector('[data-testid="oplus-prompt-modal-meta"]');
    expect(meta?.textContent).toContain('oplus.agents.prompt_modal_status_label');
    expect(meta?.textContent).not.toContain('prompt_modal_kind_');
    const badge = element.querySelector('[data-testid="oplus-prompt-modal-state"]');
    expect(badge).toBeTruthy();
    expect(badge?.classList.contains('oplus-prompt-modal__state--active')).toBe(true);
    expect(badge?.textContent).toContain('oplus.agents.prompt_modal_status_active');
  });

  it('carries the status through to the badge for a rejected attempt', async () => {
    // Post-migration the live catalogue surfaces archived AND rejected
    // attempts as distinct versions, so both must render a real label.
    stub.promptCatalogueDetailResult = {
      ...stub.promptCatalogueDetailResult,
      version: '1.1.1',
      kind: 'override',
      status: 'rejected',
    };
    await setup({ agentId: 'qgen_question', initialVersion: '1.1.0' });
    const badge = element.querySelector('[data-testid="oplus-prompt-modal-state"]');
    expect(badge?.classList.contains('oplus-prompt-modal__state--rejected')).toBe(true);
    expect(badge?.textContent).toContain('oplus.agents.prompt_modal_status_rejected');
  });

  it('keeps the kind badge in the meta for a baseline version', async () => {
    await setup({ agentId: 'qgen_question', initialVersion: 'v1' });
    const meta = element.querySelector('[data-testid="oplus-prompt-modal-meta"]');
    expect(meta?.textContent).toContain('oplus.agents.prompt_modal_kind_label');
    expect(meta?.textContent).toContain('oplus.agents.prompt_modal_kind_baseline');
    expect(element.querySelector('.oplus-prompt-modal__kind--baseline')).toBeTruthy();
    expect(element.querySelector('[data-testid="oplus-prompt-modal-state"]')).toBeNull();
  });

  it('shows metadata for a gated override version', async () => {
    stub.promptCatalogueDetailResult = {
      ...stub.promptCatalogueDetailResult,
      version: '1.1.0',
      kind: 'override',
      approved_by: FIXTURE_PROMPT_CATALOGUE_LIST.versions[1].approved_by,
      eval_run_id: 'eval-run-42',
    };
    await setup({ agentId: 'qgen_question', initialVersion: '1.1.0' });
    const meta = element.querySelector('[data-testid="oplus-prompt-modal-meta"]');
    expect(meta?.textContent).toContain('eval-run-42');
  });
});
