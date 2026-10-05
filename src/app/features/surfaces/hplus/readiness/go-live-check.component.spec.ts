import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { WritableSignal, signal } from '@angular/core';
import { provideRouter } from '@angular/router';

import { GoLiveCheckComponent } from './go-live-check.component';
import { ReadinessService } from './readiness.service';
import type { ReadinessReport, ReadinessRow, ReadinessState } from './readiness.model';

/**
 * GoLiveCheckComponent spec, H+ S6 at `/h/go-live`.
 *
 * Same report as S1, different question. S1 asks what is set up; S6 asks what
 * stands between this instance and launch. The framing is a TALLY, never an
 * invented boolean: the screen counts the server's verdicts, it does not
 * decide a go-live verdict of its own.
 *
 * The sharpest test in this file is the one that stops S6 saying "all clear"
 * while a row could not be checked. The dead checklist this replaces had a
 * `payment` test that could only ever show a tick or a cross; billing is
 * permanently uncheckable, so a screen that folds unknown into "pass" would
 * tell a tenant admin they are ready to take money when nobody has looked.
 */

function row(overrides: Partial<ReadinessRow> = {}): ReadinessRow {
  return { key: 'organisation', label: 'Organisation', status: 'ok', ...overrides };
}

/** Five ok, two attention, one unknown. */
function buildReport(overrides: Partial<ReadinessReport> = {}): ReadinessReport {
  return {
    rows: [
      row({ key: 'organisation', label: 'Organisation', status: 'ok', detail: '1 organisation.', count: 1 }),
      row({ key: 'branding', label: 'Branding', status: 'ok', detail: 'Set.' }),
      row({ key: 'features', label: 'Features', status: 'attention', detail: 'No plan confirmed.', count: 0 }),
      row({ key: 'signIn', label: 'Sign-in', status: 'ok', detail: '1 provider.', count: 1 }),
      row({ key: 'administrators', label: 'Administrators', status: 'ok', detail: '2 administrators.', count: 2 }),
      row({ key: 'content', label: 'Content', status: 'attention', detail: 'No content yet.', count: 0 }),
      row({ key: 'setup', label: 'Setup', status: 'ok', detail: 'Completed.' }),
      row({
        key: 'billing',
        label: 'Billing',
        status: 'unknown',
        reason: 'Chora cannot check this yet: invoices and payment methods are held in memory.',
      }),
    ],
    next_action: 'Confirm the plan for this organisation.',
    partial: false,
    ...overrides,
  };
}

class StubReadinessService {
  readonly _state: WritableSignal<ReadinessState> = signal<ReadinessState>({ status: 'loading' });
  readonly state = this._state.asReadonly();
  loadCalls = 0;
  load(): void {
    this.loadCalls += 1;
  }
  succeed(report: ReadinessReport = buildReport()): void {
    this._state.set({ status: 'success', report });
  }
  fail(key = 'hplus.readiness.error_upstream'): void {
    this._state.set({ status: 'error', error: key });
  }
}

function setup(): {
  fixture: ComponentFixture<GoLiveCheckComponent>;
  svc: StubReadinessService;
  el: HTMLElement;
} {
  const svc = new StubReadinessService();
  TestBed.configureTestingModule({
    imports: [GoLiveCheckComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: ReadinessService, useValue: svc },
    ],
  });
  const fixture = TestBed.createComponent(GoLiveCheckComponent);
  fixture.detectChanges();
  return { fixture, svc, el: fixture.nativeElement as HTMLElement };
}

const text = (el: HTMLElement, sel: string): string =>
  el.querySelector(sel)?.textContent?.trim() ?? '';

describe('GoLiveCheckComponent (H+ S6)', () => {
  let fixture: ComponentFixture<GoLiveCheckComponent>;
  let svc: StubReadinessService;
  let el: HTMLElement;

  beforeEach(() => {
    ({ fixture, svc, el } = setup());
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('asks for the report once on init', () => {
    expect(svc.loadCalls).toBe(1);
  });

  it('uses the same service as S1 rather than a second read', () => {
    // One service, two thin components, per the orchestrator ruling. A second
    // service would be a second place for the semantics to drift.
    expect(TestBed.inject(ReadinessService)).toBe(svc as unknown as ReadinessService);
  });

  // ---------------------------------------------------------------------
  // The tally. Unknown rows are excluded from the denominator, never folded
  // into either pass or fail.
  // ---------------------------------------------------------------------

  it('counts passes against the CHECKABLE rows, not against all rows', () => {
    svc.succeed();
    fixture.detectChanges();

    // Five ok, two attention, one unknown: five of seven, one uncheckable.
    expect(text(el, '[data-pass-count]')).toBe('5');
    expect(text(el, '[data-checkable-count]')).toBe('7');
    expect(text(el, '[data-unknown-count]')).toBe('1');
  });

  it('never counts an unknown row as a pass or as a blocker', () => {
    svc.succeed(
      buildReport({
        rows: [
          row({ key: 'organisation', status: 'ok' }),
          row({ key: 'billing', label: 'Billing', status: 'unknown', reason: 'Cannot look.' }),
        ],
        next_action: undefined,
      }),
    );
    fixture.detectChanges();

    expect(text(el, '[data-pass-count]')).toBe('1');
    expect(text(el, '[data-checkable-count]')).toBe('1');
    expect(el.querySelectorAll('[data-blockers] [data-row]').length).toBe(0);
  });

  // ---------------------------------------------------------------------
  // The sharp one for this screen.
  // ---------------------------------------------------------------------

  it('does NOT declare all clear while a row could not be checked', () => {
    // Every checkable row passes, but billing is permanently uncheckable.
    // Saying "ready to go live" here would vouch for something nobody looked
    // at, which is the exact defect the dead checklist had.
    svc.succeed(
      buildReport({
        rows: [
          row({ key: 'organisation', status: 'ok', detail: '1 organisation.' }),
          row({ key: 'setup', label: 'Setup', status: 'ok', detail: 'Completed.' }),
          row({
            key: 'billing',
            label: 'Billing',
            status: 'unknown',
            reason: 'Chora cannot check this yet.',
          }),
        ],
        next_action: undefined,
      }),
    );
    fixture.detectChanges();

    expect(el.querySelector('[data-all-clear]')).toBeNull();
    expect(el.querySelector('[data-clear-except-unchecked]')).not.toBeNull();
    expect(el.querySelectorAll('[data-uncheckable] [data-row]').length).toBe(1);
  });

  it('declares all clear only when nothing is blocking AND nothing is unchecked', () => {
    svc.succeed(
      buildReport({
        rows: [
          row({ key: 'organisation', status: 'ok', detail: '1 organisation.' }),
          row({ key: 'setup', label: 'Setup', status: 'ok', detail: 'Completed.' }),
        ],
        next_action: undefined,
      }),
    );
    fixture.detectChanges();

    expect(el.querySelector('[data-all-clear]')).not.toBeNull();
    expect(el.querySelector('[data-clear-except-unchecked]')).toBeNull();
  });

  // ---------------------------------------------------------------------
  // The verbatim pins, same two contradictions S1 carries. S6 groups rows,
  // so it has its own chance to get this wrong.
  // ---------------------------------------------------------------------

  it('treats an ok row that counted zero as a pass, not a blocker', () => {
    svc.succeed(
      buildReport({
        rows: [row({ key: 'content', label: 'Content', status: 'ok', detail: 'Seeded.', count: 0 })],
        next_action: undefined,
      }),
    );
    fixture.detectChanges();

    expect(el.querySelector('[data-blockers] [data-row="content"]')).toBeNull();
    expect(text(el, '[data-pass-count]')).toBe('1');
  });

  it('treats an attention row that counted many as a blocker, not a pass', () => {
    svc.succeed(
      buildReport({
        rows: [
          row({ key: 'administrators', label: 'Administrators', status: 'attention', detail: 'All five are pending.', count: 5 }),
        ],
        next_action: 'Invite an administrator.',
      }),
    );
    fixture.detectChanges();

    expect(el.querySelector('[data-blockers] [data-row="administrators"]')).not.toBeNull();
    expect(text(el, '[data-pass-count]')).toBe('0');
  });

  // ---------------------------------------------------------------------
  // Grouping and copy.
  // ---------------------------------------------------------------------

  it('lists blockers in the server order, not re-sorted', () => {
    svc.succeed();
    fixture.detectChanges();

    const keys = Array.from(el.querySelectorAll('[data-blockers] [data-row]')).map((n) =>
      n.getAttribute('data-row'),
    );
    expect(keys).toEqual(['features', 'content']);
  });

  it('shows every row exactly once across the three groups', () => {
    svc.succeed();
    fixture.detectChanges();

    const all = Array.from(el.querySelectorAll('[data-row]')).map((n) =>
      n.getAttribute('data-row'),
    );
    expect(all.length).toBe(8);
    expect(new Set(all).size).toBe(8);
  });

  it('gives an uncheckable row its reason rather than a verdict', () => {
    svc.succeed();
    fixture.detectChanges();

    const billing = el.querySelector('[data-uncheckable] [data-row="billing"]');
    expect(billing).not.toBeNull();
    expect(billing?.getAttribute('data-status')).toBe('unknown');
    expect(billing?.textContent).toContain('Chora cannot check this yet');
  });

  it('shows the server next action verbatim when there is one', () => {
    svc.succeed();
    fixture.detectChanges();

    expect(el.querySelector('[data-next-action]')?.textContent).toContain(
      'Confirm the plan for this organisation.',
    );
  });

  it('shows no next action when the server names none', () => {
    svc.succeed(buildReport({ next_action: undefined }));
    fixture.detectChanges();

    expect(el.querySelector('[data-next-action]')).toBeNull();
  });

  it('declares a partial answer, because a go-live call on partial data is worse', () => {
    svc.succeed(
      buildReport({ partial: true, part_errors: { identity: 'dial tcp: connection refused' } }),
    );
    fixture.detectChanges();

    const banner = el.querySelector('[data-partial-banner]');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain('identity');
  });

  it('fails loud on an error and offers a retry that reloads', () => {
    svc.fail('hplus.readiness.error_forbidden');
    fixture.detectChanges();

    expect(el.querySelector('[data-error]')).not.toBeNull();
    expect(el.querySelectorAll('[data-row]').length).toBe(0);

    const retry = el.querySelector('[data-retry]') as HTMLButtonElement | null;
    retry?.click();
    expect(svc.loadCalls).toBe(2);
  });

  it('shows the loading state before the first answer arrives', () => {
    expect(el.querySelector('[data-loading]')).not.toBeNull();
    expect(el.querySelector('[data-error]')).toBeNull();
  });

  it('answers empty tallies outside the success branch', () => {
    const c = fixture.componentInstance;
    expect(c.blockers()).toEqual([]);
    expect(c.uncheckable()).toEqual([]);
    expect(c.cleared()).toEqual([]);
    expect(c.passCount()).toBe(0);
    expect(c.checkableCount()).toBe(0);
    expect(c.allClear()).toBe(false);
  });
});
