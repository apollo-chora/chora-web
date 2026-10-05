import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { WritableSignal, signal } from '@angular/core';
import { provideRouter } from '@angular/router';

import { InstanceReadinessComponent } from './instance-readiness.component';
import { ReadinessService } from './readiness.service';
import type { ReadinessReport, ReadinessRow, ReadinessState } from './readiness.model';

/**
 * InstanceReadinessComponent spec, H+ S1 at `/h/ready`.
 *
 * The point of this screen is that it does NOT think. The server decided each
 * verdict; the screen prints it. So the sharpest tests here feed a response
 * whose verdict DISAGREES with what a client would compute from the same row,
 * and pin that the server wins. If those two tests ever go green against a
 * component that recomputes, this screen and the go-live screen can tell one
 * operator two different stories about one instance.
 */

function row(overrides: Partial<ReadinessRow> = {}): ReadinessRow {
  return { key: 'organisation', label: 'Organisation', status: 'ok', ...overrides };
}

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
  fixture: ComponentFixture<InstanceReadinessComponent>;
  svc: StubReadinessService;
  el: HTMLElement;
} {
  const svc = new StubReadinessService();
  TestBed.configureTestingModule({
    imports: [InstanceReadinessComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: ReadinessService, useValue: svc },
    ],
  });
  const fixture = TestBed.createComponent(InstanceReadinessComponent);
  fixture.detectChanges();
  return { fixture, svc, el: fixture.nativeElement as HTMLElement };
}

describe('InstanceReadinessComponent (H+ S1)', () => {
  let fixture: ComponentFixture<InstanceReadinessComponent>;
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

  it('renders all eight rows in the server order, never re-sorted', () => {
    svc.succeed();
    fixture.detectChanges();

    const keys = Array.from(el.querySelectorAll('[data-row]')).map((n) =>
      n.getAttribute('data-row'),
    );
    expect(keys).toEqual([
      'organisation',
      'branding',
      'features',
      'signIn',
      'administrators',
      'content',
      'setup',
      'billing',
    ]);
  });

  // The two verbatim pins. Each feeds a verdict that contradicts what a
  // client would compute from the same row's count.

  it('prints an ok verdict even when the row counted zero', () => {
    svc.succeed(
      buildReport({
        rows: [row({ key: 'content', label: 'Content', status: 'ok', detail: 'Seeded.', count: 0 })],
        next_action: undefined,
      }),
    );
    fixture.detectChanges();

    const node = el.querySelector('[data-row="content"]');
    expect(node?.getAttribute('data-status')).toBe('ok');
    expect(node?.classList.contains('is-ok')).toBe(true);
    expect(node?.classList.contains('is-attention')).toBe(false);
  });

  it('prints an attention verdict even when the row counted many', () => {
    svc.succeed(
      buildReport({
        rows: [
          row({ key: 'administrators', label: 'Administrators', status: 'attention', detail: 'All five are pending.', count: 5 }),
        ],
        next_action: 'Invite an administrator.',
      }),
    );
    fixture.detectChanges();

    const node = el.querySelector('[data-row="administrators"]');
    expect(node?.getAttribute('data-status')).toBe('attention');
    expect(node?.classList.contains('is-attention')).toBe(true);
    expect(node?.classList.contains('is-ok')).toBe(false);
  });

  it('renders an unknown row as an answer with its reason, not as a failure', () => {
    svc.succeed();
    fixture.detectChanges();

    const node = el.querySelector('[data-row="billing"]');
    expect(node?.getAttribute('data-status')).toBe('unknown');
    expect(node?.classList.contains('is-unknown')).toBe(true);
    // Not a second kind of red.
    expect(node?.classList.contains('is-attention')).toBe(false);
    expect(node?.textContent).toContain('Chora cannot check this yet');
  });

  it('counts only attention rows as needing work, never unknown ones', () => {
    svc.succeed();
    fixture.detectChanges();

    // Two attention rows in the default report; billing is unknown.
    expect(el.querySelectorAll('[data-status="attention"]').length).toBe(2);
    expect(el.querySelector('[data-needs-work-count]')?.textContent?.trim()).toBe('2');
  });

  it('shows the server next action verbatim', () => {
    svc.succeed();
    fixture.detectChanges();

    expect(el.querySelector('[data-next-action]')?.textContent).toContain(
      'Confirm the plan for this organisation.',
    );
  });

  it('shows no next action when the server sends none', () => {
    svc.succeed(buildReport({ next_action: undefined }));
    fixture.detectChanges();

    expect(el.querySelector('[data-next-action]')).toBeNull();
  });

  it('never derives a next action from an unknown row', () => {
    svc.succeed(
      buildReport({
        rows: [
          row({ key: 'billing', label: 'Billing', status: 'unknown', reason: 'Cannot look.' }),
        ],
        next_action: undefined,
      }),
    );
    fixture.detectChanges();

    expect(el.querySelector('[data-next-action]')).toBeNull();
  });

  it('distinguishes a row that counted zero from one that counts nothing', () => {
    svc.succeed();
    fixture.detectChanges();

    // features counted and found none.
    expect(el.querySelector('[data-row="features"] [data-count]')?.textContent?.trim()).toBe('0');
    // branding counts nothing at all, so there is no count to show.
    expect(el.querySelector('[data-row="branding"] [data-count]')).toBeNull();
  });

  it('declares a partial answer and names the parts that failed', () => {
    svc.succeed(
      buildReport({
        partial: true,
        part_errors: { identity: 'dial tcp: connection refused' },
      }),
    );
    fixture.detectChanges();

    const banner = el.querySelector('[data-partial-banner]');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain('identity');
  });

  it('shows no partial banner on a complete answer', () => {
    svc.succeed();
    fixture.detectChanges();

    expect(el.querySelector('[data-partial-banner]')).toBeNull();
  });

  it('renders a declared known gap against its row', () => {
    svc.succeed(
      buildReport({
        known_gaps: { content: 'Atoms created before the projection are not counted.' },
      }),
    );
    fixture.detectChanges();

    expect(el.querySelector('[data-row="content"] [data-known-gap]')?.textContent).toContain(
      'Atoms created before the projection are not counted.',
    );
  });

  it('fails loud on an error and offers a retry that reloads', () => {
    svc.fail('hplus.readiness.error_forbidden');
    fixture.detectChanges();

    expect(el.querySelector('[data-error]')).not.toBeNull();
    expect(el.querySelectorAll('[data-row]').length).toBe(0);

    const retry = el.querySelector('[data-retry]') as HTMLButtonElement | null;
    expect(retry).not.toBeNull();
    retry?.click();
    expect(svc.loadCalls).toBe(2);
  });

  it('shows the loading state before the first answer arrives', () => {
    expect(el.querySelector('[data-loading]')).not.toBeNull();
    expect(el.querySelector('[data-error]')).toBeNull();
  });

  // The accessors are also reachable outside the success branch. The template
  // only calls them inside it, so these two cases pin the defensive answers
  // directly rather than leaving them to a future template edit to discover.

  it('answers empty for gaps and parts while still loading', () => {
    expect(fixture.componentInstance.knownGapFor('content')).toBe('');
    expect(fixture.componentInstance.failedParts()).toEqual([]);
    expect(fixture.componentInstance.rows()).toEqual([]);
    expect(fixture.componentInstance.nextAction()).toBe('');
    expect(fixture.componentInstance.partial()).toBe(false);
  });

  it('answers empty for gaps and parts after an error', () => {
    svc.fail();
    fixture.detectChanges();

    expect(fixture.componentInstance.knownGapFor('content')).toBe('');
    expect(fixture.componentInstance.failedParts()).toEqual([]);
    expect(fixture.componentInstance.needsWorkCount()).toBe(0);
  });

  it('reports no known gap for a row the server did not declare one for', () => {
    svc.succeed(
      buildReport({ known_gaps: { content: 'Forward-only projection.' } }),
    );
    fixture.detectChanges();

    expect(fixture.componentInstance.knownGapFor('content')).toBe('Forward-only projection.');
    expect(fixture.componentInstance.knownGapFor('branding')).toBe('');
  });
});
