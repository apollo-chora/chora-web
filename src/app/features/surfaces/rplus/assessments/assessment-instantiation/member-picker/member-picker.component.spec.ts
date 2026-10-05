import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { WritableSignal, signal } from '@angular/core';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { MemberPickerComponent } from './member-picker.component';
import { TenantMembersService } from '../tenant-members.service';
import type {
  MemberSearchState,
  TenantMemberSummary,
} from '../assessment-instantiation.model';

/**
 * MemberPickerComponent spec — R+ Phase X.4 chip-input picker.
 *
 * - Renders chip list bound to component input.
 * - Search-as-you-type with min 3 chars + 300ms debounce — service.search()
 *   is only called after the debounce window with the trimmed value.
 * - Clicking a result row emits `selected` once + clears the input.
 * - Clicking chip × emits `removed` with the GCID.
 * - role=alert error banner on search failure.
 */

const MEMBER_A: TenantMemberSummary = {
  gcid: '00000000-0000-7000-8000-000000002001',
  email: 'alice@mtm.test',
  display_name: 'Alice Tan',
  avatar_url: null,
  roles: ['LEARNER'],
  last_active_at: '2026-05-16T09:30:00Z',
};

const MEMBER_B: TenantMemberSummary = {
  gcid: '00000000-0000-7000-8000-000000002002',
  email: 'bob@mtm.test',
  display_name: 'Bob Lim',
  avatar_url: null,
  roles: ['LEARNER', 'INSTRUCTOR'],
  last_active_at: '2026-05-16T11:00:00Z',
};

class StubTenantMembersService {
  readonly _searchState: WritableSignal<MemberSearchState> = signal({
    status: 'idle',
  });
  readonly searchState = this._searchState.asReadonly();
  searchCalls: string[] = [];
  clearCalls = 0;
  search(q: string): void {
    this.searchCalls.push(q);
  }
  clear(): void {
    this.clearCalls++;
  }
}

function setup(initialChips: readonly TenantMemberSummary[] = []): {
  fixture: ComponentFixture<MemberPickerComponent>;
  element: HTMLElement;
  service: StubTenantMembersService;
  selectedEvents: TenantMemberSummary[];
  removedEvents: string[];
} {
  const service = new StubTenantMembersService();
  TestBed.configureTestingModule({
    imports: [MemberPickerComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: TenantMembersService, useValue: service },
    ],
  });
  const fixture = TestBed.createComponent(MemberPickerComponent);
  fixture.componentRef.setInput('chips', initialChips);
  const selectedEvents: TenantMemberSummary[] = [];
  const removedEvents: string[] = [];
  fixture.componentInstance.selected.subscribe((m) => selectedEvents.push(m));
  fixture.componentInstance.removed.subscribe((g) => removedEvents.push(g));
  fixture.detectChanges();
  return {
    fixture,
    element: fixture.nativeElement as HTMLElement,
    service,
    selectedEvents,
    removedEvents,
  };
}

describe('MemberPickerComponent (R+ X.4 member picker)', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('chips render', () => {
    it('creates with no chips on init (empty input)', () => {
      const { fixture, element } = setup([]);
      expect(fixture.componentInstance).toBeTruthy();
      expect(
        element.querySelectorAll('[data-testid="member-picker-chip"]').length,
      ).toBe(0);
    });

    it('renders one chip per row of the chips input', () => {
      const { element } = setup([MEMBER_A, MEMBER_B]);
      expect(
        element.querySelectorAll('[data-testid="member-picker-chip"]').length,
      ).toBe(2);
    });

    it('chip × button emits removed with the GCID', () => {
      const { element, removedEvents } = setup([MEMBER_A]);
      const removeBtn = element.querySelector(
        '[data-testid="member-picker-chip-remove"]',
      ) as HTMLButtonElement;
      expect(removeBtn).toBeTruthy();
      removeBtn.click();
      expect(removedEvents).toEqual([MEMBER_A.gcid]);
    });
  });

  describe('search debounce', () => {
    it('does NOT call service.search() before the 300ms debounce window', () => {
      const { fixture, service } = setup([]);
      const input = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="member-picker-input"]',
      ) as HTMLInputElement;
      input.value = 'alic';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      // Less than 300ms — no call yet.
      vi.advanceTimersByTime(200);
      expect(service.searchCalls.length).toBe(0);
    });

    it('calls service.search() after debounce when query has ≥3 chars', () => {
      const { fixture, service } = setup([]);
      const input = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="member-picker-input"]',
      ) as HTMLInputElement;
      input.value = 'alic';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      vi.advanceTimersByTime(350);
      expect(service.searchCalls.length).toBe(1);
      expect(service.searchCalls[0]).toBe('alic');
    });

    it('does NOT call service.search() when query is < 3 chars', () => {
      const { fixture, service } = setup([]);
      const input = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="member-picker-input"]',
      ) as HTMLInputElement;
      input.value = 'al';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      vi.advanceTimersByTime(500);
      expect(service.searchCalls.length).toBe(0);
    });

    it('latest query wins — earlier debounced search is cancelled', () => {
      const { fixture, service } = setup([]);
      const input = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="member-picker-input"]',
      ) as HTMLInputElement;
      input.value = 'ali';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      vi.advanceTimersByTime(100);
      input.value = 'alice';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      vi.advanceTimersByTime(350);
      expect(service.searchCalls).toEqual(['alice']);
    });
  });

  describe('result dropdown', () => {
    function flushSearchSuccess(
      service: StubTenantMembersService,
      items: TenantMemberSummary[] = [MEMBER_A, MEMBER_B],
    ): void {
      service._searchState.set({ status: 'success', items });
    }

    it('renders a row per result when state is success', () => {
      const { service, fixture, element } = setup([]);
      flushSearchSuccess(service);
      fixture.detectChanges();
      expect(
        element.querySelectorAll('[data-testid="member-picker-result"]').length,
      ).toBe(2);
    });

    it('renders display name + email on each result row', () => {
      const { service, fixture, element } = setup([]);
      flushSearchSuccess(service);
      fixture.detectChanges();
      const first = element.querySelector(
        '[data-testid="member-picker-result"]',
      ) as HTMLElement;
      expect(first.textContent).toContain('Alice Tan');
      expect(first.textContent).toContain('alice@mtm.test');
    });

    it('clicking a result row emits selected with the member', () => {
      const { service, fixture, element, selectedEvents } = setup([]);
      flushSearchSuccess(service);
      fixture.detectChanges();
      const first = element.querySelector(
        '[data-testid="member-picker-result"]',
      ) as HTMLButtonElement;
      first.click();
      expect(selectedEvents).toEqual([MEMBER_A]);
    });

    it('clicking a result row clears the input + calls service.clear()', () => {
      const { service, fixture, element } = setup([]);
      const input = element.querySelector(
        '[data-testid="member-picker-input"]',
      ) as HTMLInputElement;
      input.value = 'alic';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      flushSearchSuccess(service);
      fixture.detectChanges();
      const first = element.querySelector(
        '[data-testid="member-picker-result"]',
      ) as HTMLButtonElement;
      first.click();
      fixture.detectChanges();
      expect(input.value).toBe('');
      expect(service.clearCalls).toBeGreaterThanOrEqual(1);
    });

    it('renders empty placeholder when success + no items', () => {
      const { service, fixture, element } = setup([]);
      flushSearchSuccess(service, []);
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="member-picker-empty"]'),
      ).toBeTruthy();
    });

    it('renders role=alert error banner when state is error', () => {
      const { service, fixture, element } = setup([]);
      service._searchState.set({
        status: 'error',
        error: 'rplus.member_picker.error',
      });
      fixture.detectChanges();
      const banner = element.querySelector(
        '[data-testid="member-picker-error"]',
      );
      expect(banner).toBeTruthy();
      expect(banner?.getAttribute('role')).toBe('alert');
    });
  });
});
