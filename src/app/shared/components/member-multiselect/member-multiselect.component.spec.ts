import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { vi, type Mock } from 'vitest';

import { MemberMultiselectComponent } from './member-multiselect.component';
import { MemberDirectoryService } from './member-directory.service';
import type { TenantMemberSummary } from '../../../features/surfaces/rplus/assessments/assessment-instantiation/assessment-instantiation.model';

/**
 * Local member factory - centralises construction so the spec never scatters
 * raw object literals (chora-web/CLAUDE.md §6). Overrides let each test tune the
 * one field it exercises.
 */
function buildMember(overrides: Partial<TenantMemberSummary> = {}): TenantMemberSummary {
  return {
    gcid: '018f0000-0000-7000-8000-000000000001',
    email: 'alice@example.com',
    display_name: 'Alice Learner',
    avatar_url: null,
    roles: ['LEARNER'],
    last_active_at: '2026-07-20T00:00:00Z',
    ...overrides,
  };
}

const G1 = '018f0000-0000-7000-8000-000000000001';
const G2 = '018f0000-0000-7000-8000-000000000002';
const G3 = '018f0000-0000-7000-8000-000000000003';

function threeLearners(): TenantMemberSummary[] {
  return [
    buildMember({ gcid: G1, display_name: 'Alice Learner', email: 'alice@example.com' }),
    buildMember({ gcid: G2, display_name: 'Bob Learner', email: 'bob@example.com' }),
    buildMember({ gcid: G3, display_name: 'Carol Learner', email: 'carol@example.com' }),
  ];
}

interface DirectoryMock {
  listMembers: Mock;
}

describe('MemberMultiselectComponent', () => {
  let fixture: ComponentFixture<MemberMultiselectComponent>;
  let component: MemberMultiselectComponent;
  let directory: DirectoryMock;

  beforeEach(async () => {
    directory = { listMembers: vi.fn().mockReturnValue(of(threeLearners())) };

    await TestBed.configureTestingModule({
      imports: [MemberMultiselectComponent],
      providers: [{ provide: MemberDirectoryService, useValue: directory }],
    }).compileComponents();

    fixture = TestBed.createComponent(MemberMultiselectComponent);
    component = fixture.componentInstance;
  });

  function render(
    memberRole: 'learner' | 'instructor' = 'learner',
    opts: { preselected?: readonly string[]; max?: number | null } = {},
  ): void {
    fixture.componentRef.setInput('memberRole', memberRole);
    if (opts.preselected !== undefined) {
      fixture.componentRef.setInput('preselectedGcids', opts.preselected);
    }
    if (opts.max !== undefined) {
      fixture.componentRef.setInput('maxSelectable', opts.max);
    }
    fixture.detectChanges();
  }

  const byTestId = (id: string): HTMLElement | null =>
    fixture.nativeElement.querySelector(`[data-testid="${id}"]`);

  const optionCheckbox = (gcid: string): HTMLInputElement =>
    fixture.nativeElement.querySelector(
      `[data-testid="member-multiselect-option-${gcid}"]`,
    ) as HTMLInputElement;

  it('loads the tenant members for the given role on init', () => {
    render('instructor');
    expect(directory.listMembers).toHaveBeenCalledWith('instructor');
  });

  it('shows the loading state while the directory call is pending', () => {
    directory.listMembers.mockReturnValue(new Subject<readonly TenantMemberSummary[]>());
    render('learner');
    expect(byTestId('member-multiselect-loading')).toBeTruthy();
    expect(byTestId('member-multiselect-list')).toBeNull();
  });

  it('shows a fail-loud error with a retry that reloads', () => {
    directory.listMembers.mockReturnValue(throwError(() => new Error('boom')));
    render('learner');

    expect(byTestId('member-multiselect-error')).toBeTruthy();
    const retry = byTestId('member-multiselect-retry') as HTMLButtonElement;
    expect(retry).toBeTruthy();

    directory.listMembers.mockReturnValue(of(threeLearners()));
    retry.click();
    fixture.detectChanges();

    expect(byTestId('member-multiselect-error')).toBeNull();
    expect(byTestId('member-multiselect-list')).toBeTruthy();
  });

  it('shows the empty state when the tenant has no members for the role', () => {
    directory.listMembers.mockReturnValue(of([]));
    render('learner');
    expect(byTestId('member-multiselect-empty')).toBeTruthy();
    expect(byTestId('member-multiselect-list')).toBeNull();
  });

  it('renders one checkbox row per member', () => {
    render('learner');
    expect(byTestId('member-multiselect-list')).toBeTruthy();
    expect(optionCheckbox(G1)).toBeTruthy();
    expect(optionCheckbox(G2)).toBeTruthy();
    expect(optionCheckbox(G3)).toBeTruthy();
  });

  it('human-formats the member last-active date instead of raw ISO (CHO-2342)', () => {
    render('learner');
    const labels = fixture.nativeElement.querySelectorAll(
      '.member-multiselect__option-label',
    );
    expect(labels.length).toBe(3);
    const first = ((labels[0] as HTMLElement).textContent ?? '').trim();
    // Row label = "display_name • email • last_active_at"; the date segment
    // (2026-07-20T00:00:00Z) must render as `d MMM y` UTC → "20 Jul 2026".
    expect(first).toContain('Alice Learner');
    expect(first).toContain('20 Jul 2026');
    expect(first).not.toContain('2026-07-20T00:00:00Z');
    expect(first).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  });

  it('wraps every option checkbox in a label for an accessible name', () => {
    render('learner');
    const inputs = fixture.nativeElement.querySelectorAll(
      '[data-testid^="member-multiselect-option-"]',
    );
    expect(inputs.length).toBe(3);
    inputs.forEach((input: HTMLInputElement) => {
      expect(input.closest('label')).toBeTruthy();
    });
  });

  it('emits the updated selection when a checkbox is toggled', () => {
    let emitted: readonly string[] | undefined;
    render('learner');
    component.selectionChange.subscribe((v) => (emitted = v));

    const cb = optionCheckbox(G1);
    cb.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(emitted).toEqual([G1]);
    expect(component.selectedCount()).toBe(1);

    cb.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(emitted).toEqual([]);
    expect(component.selectedCount()).toBe(0);
  });

  it('select-all ticks every filtered member and emits them', () => {
    let emitted: readonly string[] | undefined;
    render('learner');
    component.selectionChange.subscribe((v) => (emitted = v));

    const selectAll = byTestId('member-multiselect-select-all') as HTMLInputElement;
    selectAll.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(component.selectedCount()).toBe(3);
    expect([...(emitted ?? [])].sort()).toEqual([G1, G2, G3].sort());

    selectAll.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(component.selectedCount()).toBe(0);
  });

  it('filters the rendered list by the search term (name or email)', () => {
    render('learner');
    const search = byTestId('member-multiselect-search') as HTMLInputElement;
    search.value = 'bob';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(optionCheckbox(G2)).toBeTruthy();
    expect(optionCheckbox(G1)).toBeNull();
    expect(optionCheckbox(G3)).toBeNull();
  });

  it('select-all only ticks the filtered subset', () => {
    render('learner');
    const search = byTestId('member-multiselect-search') as HTMLInputElement;
    search.value = 'carol';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const selectAll = byTestId('member-multiselect-select-all') as HTMLInputElement;
    selectAll.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(component.selectedCount()).toBe(1);
    expect(component.isSelected(G3)).toBe(true);
    expect(component.isSelected(G1)).toBe(false);
  });

  it('pre-ticks members supplied via preselectedGcids', () => {
    render('learner', { preselected: [G2] });
    expect(optionCheckbox(G2).checked).toBe(true);
    expect(optionCheckbox(G1).checked).toBe(false);
    expect(component.selectedCount()).toBe(1);
  });

  it('enforces maxSelectable and disables further unticked rows at the cap', () => {
    render('learner', { max: 1 });

    optionCheckbox(G1).dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(component.selectedCount()).toBe(1);

    // At the cap: the untouched rows are disabled and a second tick is refused.
    expect(optionCheckbox(G2).disabled).toBe(true);
    optionCheckbox(G2).dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(component.selectedCount()).toBe(1);
    expect(component.isSelected(G2)).toBe(false);
  });

  it('reports the running selected count on a data attribute', () => {
    render('learner');
    optionCheckbox(G1).dispatchEvent(new Event('change'));
    fixture.detectChanges();
    const count = byTestId('member-multiselect-count');
    expect(count?.getAttribute('data-count')).toBe('1');
  });
});
