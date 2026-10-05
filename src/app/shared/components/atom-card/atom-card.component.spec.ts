import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AtomCardComponent } from './atom-card.component';
import type { LearningAtom } from '../../../features/atomic/models/atom.models';

function buildAtom(overrides: Partial<LearningAtom> = {}): LearningAtom {
  return {
    id: 'atom-001',
    tenant_id: 'tenant-001',
    atom_type: 'multiple_choice',
    difficulty: 3,
    language_code: 'en',
    tags: ['math', 'algebra'],
    status: 'published',
    created_by: 'gcid-001',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    latest_revision: {
      id: 'rev-001',
      atom_id: 'atom-001',
      revision_number: 1,
      content: { stem: 'What is 2+2?', options: [{ id: 1, text: '4' }] },
      validation_rules: [{ rule_type: 'exact_match', expected: '1', tolerance: null, case_sensitive: false }],
      published_at: '2026-01-01T12:00:00Z',
      created_at: '2026-01-01T00:00:00Z',
    },
    ...overrides,
  };
}

describe('AtomCardComponent', () => {
  let fixture: ComponentFixture<AtomCardComponent>;
  let component: AtomCardComponent;
  let element: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AtomCardComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(AtomCardComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement;
  });

  function setAtom(atom: LearningAtom): void {
    fixture.componentRef.setInput('atom', atom);
    fixture.detectChanges();
  }

  // -----------------------------------------------------------------------
  // Rendering
  // -----------------------------------------------------------------------

  it('renders atom title from latest revision stem', () => {
    setAtom(buildAtom());
    const title = element.querySelector('[data-testid="atom-card-title"]');
    expect(title?.textContent?.trim()).toBe('What is 2+2?');
  });

  it('renders fallback title when no latest revision', () => {
    // With tags ['math', 'algebra'], the component falls back to capitalized tags joined by ' · '
    setAtom(buildAtom({ latest_revision: null }));
    const title = element.querySelector('[data-testid="atom-card-title"]');
    expect(title?.textContent?.trim()).toBe('Math · Algebra');
  });

  it('renders flashcard front as title', () => {
    setAtom(buildAtom({
      atom_type: 'fill_blank',
      latest_revision: {
        id: 'rev-002',
        atom_id: 'atom-001',
        revision_number: 1,
        content: { front: 'Capital of France', back: 'Paris' },
        validation_rules: [],
        published_at: '2026-01-01T12:00:00Z',
        created_at: '2026-01-01T00:00:00Z',
      },
    }));
    const title = element.querySelector('[data-testid="atom-card-title"]');
    expect(title?.textContent?.trim()).toBe('Capital of France');
  });

  it('renders type label', () => {
    setAtom(buildAtom());
    expect(element.textContent).toContain('Multiple Choice');
  });

  it('renders difficulty stars', () => {
    setAtom(buildAtom({ difficulty: 3 }));
    const stars = element.querySelectorAll('.atom-card__star');
    expect(stars).toHaveLength(5);
    const filled = element.querySelectorAll('.atom-card__star--filled');
    expect(filled).toHaveLength(3);
  });

  it('renders tags', () => {
    setAtom(buildAtom({ tags: ['math', 'algebra'] }));
    const tags = element.querySelector('[data-testid="atom-card-tags"]');
    expect(tags?.textContent).toContain('math');
    expect(tags?.textContent).toContain('algebra');
  });

  it('does not render tags container when no tags', () => {
    setAtom(buildAtom({ tags: [] }));
    const tags = element.querySelector('[data-testid="atom-card-tags"]');
    expect(tags).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Status badge
  // -----------------------------------------------------------------------

  it('shows draft badge for draft atoms', () => {
    setAtom(buildAtom({ status: 'draft' }));
    const badge = element.querySelector('[data-testid="atom-card-status"]');
    expect(badge).toBeTruthy();
    expect(badge?.textContent?.trim()).toBe('draft');
  });

  it('shows archived badge for archived atoms', () => {
    setAtom(buildAtom({ status: 'archived' }));
    const badge = element.querySelector('[data-testid="atom-card-status"]');
    expect(badge).toBeTruthy();
    expect(badge?.textContent?.trim()).toBe('archived');
  });

  it('does not show badge for published atoms', () => {
    setAtom(buildAtom({ status: 'published' }));
    const badge = element.querySelector('[data-testid="atom-card-status"]');
    expect(badge).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Compact mode
  // -----------------------------------------------------------------------

  it('applies compact class when compact input is true', () => {
    fixture.componentRef.setInput('atom', buildAtom());
    fixture.componentRef.setInput('compact', true);
    fixture.detectChanges();

    const card = element.querySelector('.atom-card--compact');
    expect(card).toBeTruthy();
  });

  it('hides meta section in compact mode', () => {
    fixture.componentRef.setInput('atom', buildAtom());
    fixture.componentRef.setInput('compact', true);
    fixture.detectChanges();

    const meta = element.querySelector('.atom-card__meta');
    expect(meta).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Interactions
  // -----------------------------------------------------------------------

  it('emits selected event on click', () => {
    const atom = buildAtom();
    setAtom(atom);

    let emitted: LearningAtom | null = null;
    component.selected.subscribe((a) => (emitted = a));

    const card = element.querySelector('.atom-card') as HTMLElement;
    card.click();

    expect(emitted).toEqual(atom);
  });

  it('emits selected event on Enter key', () => {
    const atom = buildAtom();
    setAtom(atom);

    let emitted: LearningAtom | null = null;
    component.selected.subscribe((a) => (emitted = a));

    const card = element.querySelector('.atom-card') as HTMLElement;
    card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(emitted).toEqual(atom);
  });

  it('emits selected event on Space key', () => {
    const atom = buildAtom();
    setAtom(atom);

    let emitted: LearningAtom | null = null;
    component.selected.subscribe((a) => (emitted = a));

    const card = element.querySelector('.atom-card') as HTMLElement;
    card.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));

    expect(emitted).toEqual(atom);
  });

  // -----------------------------------------------------------------------
  // Accessibility
  // -----------------------------------------------------------------------

  it('has role listitem', () => {
    setAtom(buildAtom());
    const card = element.querySelector('.atom-card');
    expect(card?.getAttribute('role')).toBe('listitem');
  });

  it('has tabindex 0 for keyboard focus', () => {
    setAtom(buildAtom());
    const card = element.querySelector('.atom-card');
    expect(card?.getAttribute('tabindex')).toBe('0');
  });

  it('has descriptive aria-label', () => {
    setAtom(buildAtom({ difficulty: 4 }));
    const card = element.querySelector('.atom-card');
    const ariaLabel = card?.getAttribute('aria-label');
    expect(ariaLabel).toContain('What is 2+2?');
    expect(ariaLabel).toContain('Multiple Choice');
    expect(ariaLabel).toContain('difficulty 4 of 5');
  });

  it('has data-testid with atom id', () => {
    setAtom(buildAtom({ id: 'atom-xyz' }));
    const card = element.querySelector('[data-testid="atom-card-atom-xyz"]');
    expect(card).toBeTruthy();
  });
});
