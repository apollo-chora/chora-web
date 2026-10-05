import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { FamiliarMapMemoryPanelComponent } from './familiar-map-memory-panel.component';
import type { FamiliarMapMemory, FamiliarMemoryState } from '../familiar-map.model';

function makeMemory(overrides: Partial<FamiliarMapMemory> = {}): FamiliarMapMemory {
  return {
    familiarId: 'fam-1',
    name: 'Sage',
    focus: 'Algebra',
    persona: 'Patient mentor',
    rules: { tone: 'gentle' },
    evolutionTier: 'hatchling',
    skills: ['hint', 'recall'],
    hasMemory: true,
    memories: [
      {
        id: 'm1',
        memoryType: 'preference',
        content: 'Likes visual proofs',
        createdAt: '2026-06-01T10:00:00Z',
      },
    ],
    visibleNeighbors: [
      {
        conceptId: 'c1',
        conceptTitle: 'Fractions',
        citations: [{ atomId: 'a1', atomTitle: 'Halves', topicNodePath: 'math/fractions' }],
      },
    ],
    researchNotes: [],
    ...overrides,
  };
}

describe('FamiliarMapMemoryPanelComponent', () => {
  let fixture: ComponentFixture<FamiliarMapMemoryPanelComponent>;
  let component: FamiliarMapMemoryPanelComponent;
  let element: HTMLElement;

  function render(state: FamiliarMemoryState): void {
    fixture.componentRef.setInput('state', state);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FamiliarMapMemoryPanelComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(FamiliarMapMemoryPanelComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
  });

  // ── D1: the portrait is the Companion's own art, never a fixed glyph ──
  //
  // The header used a hardcoded `fa-dragon` for EVERY species, and being an
  // icon font it rendered an EMPTY circle when the font did not load, which is
  // how a wrong portrait passed for a missing one. The panel now renders the
  // shared <chora-breed-art>, the same component eight other surfaces use.
  describe('companion portrait (D1)', () => {
    it('renders the species art when the host supplies a portrait', () => {
      fixture.componentRef.setInput('portrait', { species: 'penguin', stage: 3 });
      render({ status: 'success', memory: makeMemory({ name: 'Pingu' }) });

      const art = element.querySelector('[data-testid="fmemory-portrait"] chora-breed-art');
      expect(art).toBeTruthy();
      const img = art?.querySelector('img');
      expect(img?.getAttribute('src')).toContain('penguin/penguin-stage-3.png');
    });

    it('never renders the retired dragon glyph', () => {
      fixture.componentRef.setInput('portrait', { species: 'penguin', stage: 3 });
      render({ status: 'success', memory: makeMemory() });

      expect(element.querySelector('.fa-dragon')).toBeNull();
    });

    it('renders NO portrait when the host has not resolved one', () => {
      render({ status: 'success', memory: makeMemory() });

      // Honest empty beats a guess: a pod portrait here would assert the
      // Companion is unhatched, which is a different claim from "not known yet".
      expect(element.querySelector('[data-testid="fmemory-portrait"]')).toBeNull();
    });
  });

  it('renders the idle state', () => {
    render({ status: 'idle' });
    expect(element.querySelector('[data-testid="fmemory-idle"]')).toBeTruthy();
    expect(component.memory()).toBeNull();
  });

  it('renders the loading state', () => {
    render({ status: 'loading' });
    expect(element.querySelector('[data-testid="fmemory-loading"]')).toBeTruthy();
  });

  it('renders the error state', () => {
    render({ status: 'error', error: 'aplus.discovery.familiar.memory_error' });
    const err = element.querySelector('[data-testid="fmemory-error"]');
    expect(err).toBeTruthy();
    expect(err?.getAttribute('role')).toBe('alert');
  });

  it('renders persona, tier, skills, rules and citations on success', () => {
    render({ status: 'success', memory: makeMemory() });

    expect(element.querySelector('[data-testid="fmemory-name"]')?.textContent).toContain('Sage');
    expect(element.querySelector('[data-testid="fmemory-tier"]')?.textContent).toContain(
      'hatchling',
    );
    expect(element.querySelector('[data-testid="fmemory-focus"]')?.textContent).toContain(
      'Algebra',
    );
    expect(element.querySelector('[data-testid="fmemory-skills"]')).toBeTruthy();
    expect(element.querySelector('[data-testid="fmemory-rules"]')).toBeTruthy();
    expect(element.querySelector('[data-testid="fmemory-neighbor-c1"]')).toBeTruthy();
    expect(element.querySelector('[data-testid="fmemory-citation-a1"]')?.textContent).toContain(
      'Halves',
    );
  });

  it('never renders the recap laundry list, even with memories (CHO-2116)', () => {
    render({ status: 'success', memory: makeMemory() });
    expect(element.querySelector('[data-testid="fmemory-list"]')).toBeNull();
    expect(element.querySelector('[data-testid="fmemory-entry-m1"]')).toBeNull();
  });

  // ── Goal-scoped knowledge block (CHO-2116 tier 1) ──────────────────────
  it('renders the goal-scoped knowledge block when provided', () => {
    fixture.componentRef.setInput('goalKnowledge', {
      shaky: [
        { title: 'Multiplication Tables', due: true },
        { title: 'Equivalence Test', due: false },
      ],
      mastered: ['Quadratics'],
    });
    render({ status: 'success', memory: makeMemory() });

    const block = element.querySelector('[data-testid="fmemory-goal-knowledge"]');
    expect(block).toBeTruthy();
    expect(block?.textContent).toContain('Multiplication Tables');
    expect(block?.textContent).toContain('Equivalence Test');
    expect(block?.textContent).toContain('Quadratics');
    expect(element.querySelectorAll('[data-testid="fmemory-knowledge-due"]').length).toBe(1);
  });

  it('renders the honest knowledge empty state when nothing is known yet', () => {
    fixture.componentRef.setInput('goalKnowledge', { shaky: [], mastered: [] });
    render({ status: 'success', memory: makeMemory() });
    expect(element.querySelector('[data-testid="fmemory-knowledge-empty"]')).toBeTruthy();
  });

  it('omits the knowledge block entirely when no goal context is passed', () => {
    render({ status: 'success', memory: makeMemory() });
    expect(element.querySelector('[data-testid="fmemory-goal-knowledge"]')).toBeNull();
  });

  it('falls back to the atom id when the citation title is empty', () => {
    render({
      status: 'success',
      memory: makeMemory({
        visibleNeighbors: [
          {
            conceptId: 'c1',
            conceptTitle: 'Fractions',
            citations: [{ atomId: 'a9', atomTitle: '', topicNodePath: '' }],
          },
        ],
      }),
    });
    expect(element.querySelector('[data-testid="fmemory-citation-a9"]')?.textContent).toContain(
      'a9',
    );
  });

  it('flattens the rules object into displayable entries', () => {
    render({
      status: 'success',
      memory: makeMemory({ rules: { tone: 'gentle', pace: 'slow' } }),
    });
    expect(component.ruleEntries()).toEqual([
      { key: 'tone', value: 'gentle' },
      { key: 'pace', value: 'slow' },
    ]);
  });

  // ── The Companion's reflection (CHO-2118 tier 2) ───────────────────────
  //
  // Tier 2 is the LLM narrative; tier 1 (above) is the deterministic list. The
  // reflection is ADDITIVE to tier 1 and fails soft TO it: any absence — an
  // HTTP error, a learner with no signal — hides the prose and leaves the
  // deterministic block standing. It never renders an error card.

  const KNOWN = { shaky: [{ title: 'Fractions', due: false }], mastered: [] };

  it('renders the reflection prose + the D2 disclosure when fresh', () => {
    fixture.componentRef.setInput('goalKnowledge', KNOWN);
    fixture.componentRef.setInput('reflection', {
      text: 'I remember you asked about fractions as rocket stages.',
      status: 'fresh',
    });
    render({ status: 'success', memory: makeMemory() });

    expect(element.querySelector('[data-testid="fmemory-reflection"]')?.textContent).toContain(
      'rocket stages',
    );
    // IMDA D2 (owner decision 5): the learner is always told this is the
    // companion's synthesis, shaped by memory — never passed off as fact.
    expect(element.querySelector('[data-testid="fmemory-reflection-disclosure"]')).toBeTruthy();
    expect(element.querySelector('[data-testid="fmemory-reflection-pending"]')).toBeNull();
  });

  it('serves the last good prose + a subtle marker while reflecting', () => {
    fixture.componentRef.setInput('goalKnowledge', KNOWN);
    fixture.componentRef.setInput('reflection', {
      text: 'last good reflection',
      status: 'reflecting',
    });
    render({ status: 'success', memory: makeMemory() });

    // Serve-stale-while-regen: an invalidated row KEEPS its text, so the
    // learner sees the last good reflection — never a blank where prose was.
    expect(element.querySelector('[data-testid="fmemory-reflection"]')?.textContent).toContain(
      'last good reflection',
    );
    expect(element.querySelector('[data-testid="fmemory-reflection-pending"]')).toBeTruthy();
  });

  it('shows only the marker while reflecting with no previous prose', () => {
    fixture.componentRef.setInput('goalKnowledge', KNOWN);
    fixture.componentRef.setInput('reflection', { text: '', status: 'reflecting' });
    render({ status: 'success', memory: makeMemory() });

    expect(element.querySelector('[data-testid="fmemory-reflection-pending"]')).toBeTruthy();
    // No empty quote block, and nothing to disclose yet.
    expect(element.querySelector('[data-testid="fmemory-reflection"]')).toBeNull();
    expect(element.querySelector('[data-testid="fmemory-reflection-disclosure"]')).toBeNull();
  });

  it('renders the reflection even when the tier-1 lists are empty', () => {
    // A learner can have MEMORIES but no shaky/mastered concepts — the BE's
    // HasSignal() is true, so a reflection exists. The knowledge block must not
    // collapse to its empty state and swallow real prose.
    fixture.componentRef.setInput('goalKnowledge', { shaky: [], mastered: [] });
    fixture.componentRef.setInput('reflection', {
      text: 'We have only just begun this map together.',
      status: 'fresh',
    });
    render({ status: 'success', memory: makeMemory() });

    expect(element.querySelector('[data-testid="fmemory-reflection"]')).toBeTruthy();
    expect(element.querySelector('[data-testid="fmemory-knowledge-empty"]')).toBeNull();
  });

  it('states honestly that there is no reflection yet (never fabricates)', () => {
    fixture.componentRef.setInput('goalKnowledge', KNOWN);
    fixture.componentRef.setInput('reflection', { text: '', status: 'none' });
    render({ status: 'success', memory: makeMemory() });

    expect(element.querySelector('[data-testid="fmemory-reflection-none"]')).toBeTruthy();
    expect(element.querySelector('[data-testid="fmemory-reflection"]')).toBeNull();
  });

  it('shows ONE empty state when nothing is known and no reflection exists', () => {
    fixture.componentRef.setInput('goalKnowledge', { shaky: [], mastered: [] });
    fixture.componentRef.setInput('reflection', { text: '', status: 'none' });
    render({ status: 'success', memory: makeMemory() });

    // The deterministic empty line already says it; a second "no reflection
    // yet" underneath it would just be the same silence twice.
    expect(element.querySelector('[data-testid="fmemory-knowledge-empty"]')).toBeTruthy();
    expect(element.querySelector('[data-testid="fmemory-reflection-none"]')).toBeNull();
  });

  it('fails SOFT to tier 1 when the reflection read failed (null)', () => {
    fixture.componentRef.setInput('goalKnowledge', KNOWN);
    render({ status: 'success', memory: makeMemory() });

    // No reflection block of any kind — but the deterministic block survives.
    expect(element.querySelector('[data-testid="fmemory-reflection"]')).toBeNull();
    expect(element.querySelector('[data-testid="fmemory-reflection-pending"]')).toBeNull();
    expect(element.querySelector('[data-testid="fmemory-reflection-none"]')).toBeNull();
    expect(element.querySelector('[data-testid="fmemory-goal-knowledge"]')).toBeTruthy();
    expect(element.querySelector('[data-testid="fmemory-goal-knowledge"]')?.textContent).toContain(
      'Fractions',
    );
  });

  it('has no critical accessibility violations', async () => {
    fixture.componentRef.setInput('goalKnowledge', KNOWN);
    fixture.componentRef.setInput('reflection', {
      text: 'I remember you asked about fractions.',
      status: 'reflecting',
    });
    render({ status: 'success', memory: makeMemory() });
    const axe = (await import('axe-core')).default;
    const results = await axe.run(fixture.nativeElement);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
  });
});

/**
 * CHO-2185 — research notes get a reader.
 *
 * CHO-2179 persisted a grounded note's provenance and NOTHING could read it back.
 * The note is surfaced here, in the panel the learner already opens to see what
 * their Companion knows — not on a new screen (owner ruling: "persist the record,
 * do not invent a screen").
 *
 * ⚠ This is NOT the recap laundry list CHO-2116 removed. That was every raw
 * remembered fact, chat turns included. This is the grounded notes only — the ones
 * that made a live web search on the learner's behalf and therefore owe an account
 * of it (IMDA D2).
 */
describe('FamiliarMapMemoryPanelComponent — research notes (CHO-2185)', () => {
  let fixture: ComponentFixture<FamiliarMapMemoryPanelComponent>;
  let element: HTMLElement;

  const GROUNDED_NOTE = {
    id: 'r1',
    memoryType: 'research',
    content: 'The Earth is an oblate spheroid.',
    createdAt: '2026-07-01T10:00:00Z',
    sourceMetadata: {
      webSearchQueries: ['shape of the earth'],
      citations: [
        { domain: 'nasa.gov', title: 'Earth’s true shape', snippet: 'It bulges at the equator.' },
      ],
    },
  };

  function render(memory: Partial<FamiliarMapMemory>): void {
    fixture.componentRef.setInput('state', {
      status: 'success',
      memory: makeMemory(memory),
    } as FamiliarMemoryState);
    fixture.detectChanges();
  }

  function qs(testid: string): HTMLElement | null {
    return element.querySelector(`[data-testid="${testid}"]`);
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FamiliarMapMemoryPanelComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(FamiliarMapMemoryPanelComponent);
    element = fixture.nativeElement as HTMLElement;
  });

  it('renders the note WITH its durable sources and the queries it issued', () => {
    render({ researchNotes: [GROUNDED_NOTE] });

    const block = qs('fmemory-research');
    expect(block).toBeTruthy();
    expect(block!.textContent).toContain('The Earth is an oblate spheroid.');

    // The provenance rides the ONE shared attribution component.
    const attribution = qs('grounded-attribution');
    expect(attribution).toBeTruthy();
    expect(qs('grounded-sources')!.textContent).toContain('nasa.gov');
    expect(qs('grounded-queries')!.textContent).toContain('shape of the earth');
  });

  it('renders NO Google chip — a persisted chip is a wall of dead links (D4)', () => {
    render({ researchNotes: [GROUNDED_NOTE] });

    expect(qs('grounded-chip')).toBeNull();
  });

  it('never renders an anchor for a persisted source — the uri was not stored', () => {
    render({ researchNotes: [GROUNDED_NOTE] });

    expect(qs('grounded-sources')!.querySelectorAll('a').length).toBe(0);
  });

  it('says plainly that a pre-0094 note has no recorded provenance — invents nothing', () => {
    render({
      researchNotes: [
        {
          id: 'r0',
          memoryType: 'research',
          content: 'An older note.',
          createdAt: '2026-06-01T10:00:00Z',
        },
      ],
    });

    expect(qs('fmemory-research')!.textContent).toContain('An older note.');
    expect(qs('fmemory-research-unrecorded')).toBeTruthy();
    // No attribution block at all — an empty one would imply a search that never happened.
    expect(qs('grounded-attribution')).toBeNull();
  });

  it('hides the block entirely when there are no research notes', () => {
    render({ researchNotes: [] });

    expect(qs('fmemory-research')).toBeNull();
  });

  it('does NOT reintroduce the recap laundry list CHO-2116 removed', () => {
    render({
      researchNotes: [],
      memories: [
        {
          id: 'm9',
          memoryType: 'chat_turn',
          content: 'we chatted about fractions',
          createdAt: '2026-07-01T10:00:00Z',
        },
      ],
    });

    expect(element.textContent).not.toContain('we chatted about fractions');
  });
});
