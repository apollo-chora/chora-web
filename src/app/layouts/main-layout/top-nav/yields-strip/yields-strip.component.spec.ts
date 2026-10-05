import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { YieldsStripComponent } from './yields-strip.component';
import { DashboardService } from '../../../../features/surfaces/aplus/dashboard/dashboard.service';
import { MeManaService } from '../../../../core/services/me-mana.service';
import type { DashboardState } from '../../../../features/surfaces/aplus/dashboard/dashboard.model';

interface Opts {
  readonly dashboard?: DashboardState;
  readonly mana?: { status: 'loading' | 'success' | 'error'; balance?: number };
}

function summary(streakDays: number | undefined, legacy = 0): DashboardState {
  return {
    status: 'success',
    summary: {
      gcidPillLabel: '',
      userDisplayName: '',
      currentStreakDays: legacy,
      learnerCourses: [],
      instructorCourses: [],
      ...(streakDays === undefined
        ? {}
        : { streak: { current_streak_days: streakDays } }),
    },
  } as DashboardState;
}

let loadCalls = 0;

function setup(opts: Opts = {}): {
  fixture: ComponentFixture<YieldsStripComponent>;
  el: HTMLElement;
} {
  loadCalls = 0;
  const dash = signal<DashboardState>(opts.dashboard ?? summary(0));
  const manaOpt = opts.mana ?? { status: 'success' as const, balance: 0 };
  const manaState = signal(
    manaOpt.status === 'success'
      ? { status: 'success', mana: { balance_units: manaOpt.balance ?? 0 } }
      : manaOpt.status === 'error'
        ? { status: 'error', error: 'boom' }
        : { status: 'loading' },
  );

  TestBed.configureTestingModule({
    providers: [
      {
        provide: DashboardService,
        useValue: {
          state: dash.asReadonly(),
          summary: () => (dash().status === 'success' ? (dash() as never as { summary: unknown }).summary : null),
          load: () => {
            loadCalls += 1;
          },
        },
      },
      {
        provide: MeManaService,
        useValue: {
          loadState: manaState.asReadonly(),
          mana: () =>
            manaState().status === 'success'
              ? (manaState() as never as { mana: unknown }).mana
              : null,
          balanceUnits: () =>
            manaState().status === 'success'
              ? ((manaState() as never as { mana: { balance_units: number } }).mana
                  .balance_units)
              : 0,
          load: () => {
            loadCalls += 1;
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(YieldsStripComponent);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

function text(el: HTMLElement, testid: string): string {
  return el.querySelector(`[data-testid="${testid}"]`)?.textContent?.trim() ?? '';
}

describe('YieldsStripComponent', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('names the strip for assistive technology', () => {
    const { el } = setup();
    const strip = el.querySelector('[data-testid="yields-strip"]');
    expect(strip?.getAttribute('aria-label')).toBeTruthy();
  });

  it('loads both reads itself, so the strip lights outside the dashboard route', () => {
    setup();
    // B5 left this wire open: DashboardService only loaded on /a/dashboard, so
    // the streak (and the companion mood it seeds) was blank everywhere else.
    // The strip is top-bar chrome, so it is the global loader.
    expect(loadCalls).toBe(2);
  });

  it('shows the streak from the structured block', () => {
    const { el } = setup({ dashboard: summary(7) });
    expect(text(el, 'yields-streak-value')).toBe('7');
  });

  it('falls back to the legacy streak field when the block is absent', () => {
    const { el } = setup({ dashboard: summary(undefined, 4) });
    expect(text(el, 'yields-streak-value')).toBe('4');
  });

  it('shows a real zero streak as zero', () => {
    const { el } = setup({ dashboard: summary(0) });
    expect(text(el, 'yields-streak-value')).toBe('0');
  });

  it('NEVER shows a number for a streak it could not read', () => {
    const { el } = setup({ dashboard: { status: 'error', error: 'x' } as DashboardState });
    expect(el.querySelector('[data-testid="yields-streak-value"]')).toBeNull();
    expect(el.querySelector('[data-testid="yields-streak-unread"]')).toBeTruthy();
  });

  it('shows the mana balance when the read succeeded', () => {
    const { el } = setup({ mana: { status: 'success', balance: 120 } });
    expect(text(el, 'yields-mana-value')).toBe('120');
  });

  it('shows a real zero balance as zero', () => {
    const { el } = setup({ mana: { status: 'success', balance: 0 } });
    expect(text(el, 'yields-mana-value')).toBe('0');
  });

  it('NEVER shows 0 for a mana balance it could not read', () => {
    // balanceUnits() returns `?? 0`, so reading it alone would ship "0 mana" to
    // a learner whose read simply failed. The strip branches on loadState.
    const { el } = setup({ mana: { status: 'error' } });
    expect(el.querySelector('[data-testid="yields-mana-value"]')).toBeNull();
    expect(el.querySelector('[data-testid="yields-mana-unread"]')).toBeTruthy();
  });

  it('distinguishes a loading mana read from a failed one', () => {
    const { el } = setup({ mana: { status: 'loading' } });
    expect(el.querySelector('[data-testid="yields-mana-value"]')).toBeNull();
    expect(el.querySelector('[data-testid="yields-mana-loading"]')).toBeTruthy();
  });

  it('renders NO XP pill at all, because no XP-today read model exists', () => {
    // Ruled by the orchestrator (Q2): the only xp on the wire is
    // LearnerCourseSummary.xpEarned, which is per-course CUMULATIVE. Summing it
    // would be an invented number; a permanently dashed pill in the top bar of
    // every A+ screen is noise. The pill joins when the XP wave lands.
    const { el } = setup();
    expect(el.querySelector('[data-testid="yields-xp"]')).toBeNull();
    expect(el.textContent).not.toMatch(/\bXP\b/);
  });
});
