import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateService } from '../../../../../../core/services/translate.service';

import { CplusPersonCardComponent } from './cplus-person-card.component';
import type { SharedAtomFeedEntry } from '../../../models/cplus-shared-atoms.model';

const ATOM: SharedAtomFeedEntry = {
  share_entry_id: '019700aa-0000-7000-8000-000000000001',
  author_gcid: 'gcid-019700aa-abc',
  author_display_name: 'Phyllis Tan',
  atom_id: '019700bb-0000-7000-8000-0000000000ff',
  atom_revision_id: 'rev-001',
  atom_stem_preview: 'Bayesian inference — priors and posteriors',
  question_type: 'multiple_choice',
  caption: 'Priors finally clicked!',
  license_terms: 'cc_by_sa',
  reaction_count: 12,
  created_at: '2026-06-19T10:00:00Z',
};

describe('CplusPersonCardComponent', () => {
  let fixture: ComponentFixture<CplusPersonCardComponent>;
  let component: CplusPersonCardComponent;
  let element: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CplusPersonCardComponent],
      providers: [TranslateService],
    }).compileComponents();
    fixture = TestBed.createComponent(CplusPersonCardComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement;
  });

  it('creates', () => {
    fixture.componentRef.setInput('gcid', 'gcid-abc');
    fixture.componentRef.setInput('displayName', 'Test');
    expect(component).toBeTruthy();
  });

  it('shows avatar initial from display name', () => {
    fixture.componentRef.setInput('gcid', 'gcid-019700aa-abc');
    fixture.componentRef.setInput('displayName', 'Phyllis Tan');
    fixture.detectChanges();
    const avatar = element.querySelector('.cplus-person-card__avatar');
    expect(avatar?.textContent).toBe('P');
  });

  it('falls back to GCID initial when name empty', () => {
    fixture.componentRef.setInput('gcid', 'gcid-019700aa-abc');
    fixture.componentRef.setInput('displayName', '');
    fixture.detectChanges();
    const avatar = element.querySelector('.cplus-person-card__avatar');
    expect(avatar?.textContent).toBe('0');
  });

  it('shows short GCID', () => {
    fixture.componentRef.setInput('gcid', 'gcid-019700aa-abc-def');
    fixture.componentRef.setInput('displayName', 'Phyllis');
    fixture.detectChanges();
    const gcid = element.querySelector('.cplus-person-card__gcid');
    expect(gcid?.textContent).toContain('gcid-019700a');
  });

  it('shows share count stat', () => {
    // 4a5bb1834 replaced the <chora-cplus-stat-card> child with the denser
    // inline stat row, so counting that component asserted an implementation
    // detail the card no longer has and had been red on main ever since.
    // Assert the VALUE reaching the DOM instead: that survives the next
    // markup change and is what the test name always meant.
    fixture.componentRef.setInput('gcid', 'gcid-abc');
    fixture.componentRef.setInput('displayName', 'Test');
    fixture.componentRef.setInput('shareCount', 7);
    fixture.detectChanges();
    const value = element.querySelector('.cplus-person-card__stat-value');
    expect(value).not.toBeNull();
    expect(value?.textContent?.trim()).toBe('7');
  });

  it('renders recent atoms when provided', () => {
    fixture.componentRef.setInput('gcid', 'gcid-abc');
    fixture.componentRef.setInput('displayName', 'Test');
    fixture.componentRef.setInput('recentAtoms', [ATOM]);
    fixture.detectChanges();
    const items = element.querySelectorAll('.cplus-person-card__atom-item');
    expect(items.length).toBe(1);
    expect(items[0]?.textContent).toContain('Bayesian inference');
  });

  it('hides recent atoms section when empty', () => {
    fixture.componentRef.setInput('gcid', 'gcid-abc');
    fixture.componentRef.setInput('displayName', 'Test');
    fixture.componentRef.setInput('recentAtoms', []);
    fixture.detectChanges();
    const section = element.querySelector('.cplus-person-card__atoms');
    expect(section).toBeNull();
  });

  it('emits back when back button clicked', () => {
    fixture.componentRef.setInput('gcid', 'gcid-abc');
    fixture.componentRef.setInput('displayName', 'Test');
    fixture.componentRef.setInput('showBack', true);
    fixture.detectChanges();
    let emitted = false;
    component.back.subscribe(() => (emitted = true));
    const btn = element.querySelector<HTMLButtonElement>('.cplus-person-card__back-btn');
    btn?.click();
    expect(emitted).toBe(true);
  });

  it('limits visible atoms to 5', () => {
    fixture.componentRef.setInput('gcid', 'gcid-abc');
    fixture.componentRef.setInput('displayName', 'Test');
    const atoms: SharedAtomFeedEntry[] = Array.from({ length: 10 }, (_, i) => ({
      ...ATOM,
      share_entry_id: `019700aa-0000-7000-8000-${String(i).padStart(12, '0')}`,
    }));
    fixture.componentRef.setInput('recentAtoms', atoms);
    fixture.detectChanges();
    const items = element.querySelectorAll('.cplus-person-card__atom-item');
    expect(items.length).toBe(5);
  });
});
