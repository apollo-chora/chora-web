/**
 * grounded-attribution.component.spec.ts — CHO-2179 (ADR-231 D4/D5).
 *
 * RED-first. This component exists to hold, in ONE reviewed place, the
 * `DomSanitizer.bypassSecurityTrustHtml` that Google's Search-Suggestions chip
 * requires — a deliberate XSS-boundary exception, because the Grounding-with-
 * Google-Search Service Terms forbid altering Google's HTML. A bypass that gets
 * copy-pasted per surface is a bypass nobody reviews.
 *
 * The three things it renders, and why each is separate:
 *   - SOURCES   — "domain — title", linking the (ephemeral) redirect uri. The
 *                 DOMAIN is the durable identity (D4); the uri expires ~30d.
 *   - SEARCHED  — the issued web_search_queries. Plain strings that never
 *                 expire. TRANSPARENCY METADATA, never knowledge — so it must
 *                 render visually distinct from the answer.
 *   - CHIP      — Google's HTML, verbatim, unmodified.
 *
 * And the rule that binds them: NO FABRICATION. An absent channel renders
 * nothing at all — never an empty husk, never invented copy.
 */
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { GroundedAttributionComponent } from './grounded-attribution.component';
import { TranslateService } from '../../../core/services/translate.service';
import type { SeekerCitation } from '../../../core/familiar/familiar-growth.model';

const CHIP_HTML =
  '<div class="container"><style>.c{color:red}</style><a href="https://google.com/search?q=x">Related searches</a></div>';

const CITATIONS: readonly SeekerCitation[] = [
  {
    url: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/AbC123LongOpaqueExpiringToken',
    title: 'Earth is an oblate spheroid',
    snippet: 'Measurements confirm it.',
    domain: 'nasa.gov',
  },
];

function setup(inputs: {
  citations?: readonly SeekerCitation[];
  searchEntryPointHtml?: string;
  webSearchQueries?: readonly string[];
}) {
  TestBed.configureTestingModule({
    imports: [GroundedAttributionComponent],
    providers: [TranslateService],
  });
  const fixture = TestBed.createComponent(GroundedAttributionComponent);
  fixture.componentRef.setInput('citations', inputs.citations ?? []);
  fixture.componentRef.setInput('searchEntryPointHtml', inputs.searchEntryPointHtml ?? '');
  fixture.componentRef.setInput('webSearchQueries', inputs.webSearchQueries ?? []);
  fixture.detectChanges();
  return fixture;
}

function q(fixture: ReturnType<typeof setup>, testid: string): HTMLElement | null {
  return fixture.nativeElement.querySelector(`[data-testid="${testid}"]`);
}

beforeEach(() => TestBed.resetTestingModule());

describe('GroundedAttributionComponent — the chip (Google ToS display obligation, ADR-231 D5)', () => {
  it('renders Google’s chip HTML VERBATIM — style tags and all', () => {
    const fixture = setup({ searchEntryPointHtml: CHIP_HTML, citations: CITATIONS });
    const chip = q(fixture, 'grounded-chip');
    expect(chip).not.toBeNull();
    // Verbatim: we may not restyle, re-wrap, or strip. If Angular sanitised it,
    // the <style> and the href would be gone — which would breach the ToS.
    expect(chip!.innerHTML).toContain('Related searches');
    expect(chip!.innerHTML).toContain('<style>');
    expect(chip!.innerHTML).toContain('https://google.com/search?q=x');
  });

  it('renders NO chip element when the vendor returned none (no fabrication)', () => {
    const fixture = setup({ citations: CITATIONS, searchEntryPointHtml: '' });
    expect(q(fixture, 'grounded-chip')).toBeNull();
  });
});

describe('GroundedAttributionComponent — sources (ADR-231 D4: domain is durable, uri expires)', () => {
  it('names the source by its DURABLE domain, and links the ephemeral uri', () => {
    const fixture = setup({ citations: CITATIONS });
    const source = q(fixture, 'grounded-source-nasa.gov');
    expect(source).not.toBeNull();
    // The learner sees "nasa.gov", NOT a 200-char grounding-api-redirect URL.
    expect(source!.textContent).toContain('nasa.gov');
    expect(source!.textContent).toContain('Earth is an oblate spheroid');
    expect(source!.textContent).not.toContain('grounding-api-redirect');
    // ...but the click-through is still the redirect uri.
    expect(source!.getAttribute('href')).toBe(CITATIONS[0].url);
    expect(source!.getAttribute('rel')).toContain('noopener');
  });

  it('renders no sources block when there are none (the hedge)', () => {
    const fixture = setup({ webSearchQueries: ['flat earth proof'] });
    expect(q(fixture, 'grounded-sources')).toBeNull();
  });

  // Caught on the LIVE WALK (CHO-2179), not by any unit test — because every
  // fixture title here was a real headline, and Vertex's are usually not.
  //
  // A Vertex grounding chunk's `title` is very often just the SITE NAME
  // ("aai.org", "wikipedia.org"), identical to `domain`. Rendering "domain —
  // title" verbatim then printed the domain TWICE ("britannica.com" above
  // "britannica.com"), which reads to a learner as a rendering bug.
  //
  // Suppress the RENDER, never the DATA: the title stays on the wire and in the
  // persisted provenance, because for other chunks it IS a real headline.
  it('does not print the domain twice when the vendor title IS the site name', () => {
    const fixture = setup({
      citations: [
        { url: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/X', title: 'aai.org', snippet: 's', domain: 'aai.org' },
      ],
    });
    const source = q(fixture, 'grounded-source-aai.org')!;
    const occurrences = (source.textContent ?? '').split('aai.org').length - 1;
    expect(occurrences).toBe(1);
  });

  it('still renders a REAL headline alongside the domain', () => {
    const fixture = setup({ citations: CITATIONS }); // title = 'Earth is an oblate spheroid'
    const source = q(fixture, 'grounded-source-nasa.gov')!;
    expect(source.textContent).toContain('nasa.gov');
    expect(source.textContent).toContain('Earth is an oblate spheroid');
  });

  it('treats a case/whitespace-different title as the same site name', () => {
    const fixture = setup({
      citations: [
        { url: 'https://x', title: '  WIKIPEDIA.ORG ', snippet: '', domain: 'wikipedia.org' },
      ],
    });
    const source = q(fixture, 'grounded-source-wikipedia.org')!;
    const occurrences = (source.textContent ?? '').toLowerCase().split('wikipedia.org').length - 1;
    expect(occurrences).toBe(1);
  });
});

describe('GroundedAttributionComponent — "what I searched" (CHO-2179, durable transparency)', () => {
  it('renders the issued queries, labelled as what was SEARCHED (not as knowledge)', () => {
    const fixture = setup({
      citations: CITATIONS,
      webSearchQueries: ['shape of the earth', 'oblate spheroid'],
    });
    const queries = q(fixture, 'grounded-queries');
    expect(queries).not.toBeNull();
    expect(queries!.textContent).toContain('shape of the earth');
    expect(queries!.textContent).toContain('oblate spheroid');
  });

  it('survives the hedge — a search that found nothing still says what it searched', () => {
    // The BE emits queries on a no-citation hedge on purpose: the familiar DID
    // search, and "try rephrasing" is useless if it hides what it tried.
    const fixture = setup({ webSearchQueries: ['flat earth proof'] });
    expect(q(fixture, 'grounded-queries')!.textContent).toContain('flat earth proof');
    expect(q(fixture, 'grounded-sources')).toBeNull();
    expect(q(fixture, 'grounded-chip')).toBeNull();
  });

  it('renders NO queries element when the vendor issued none (no fabrication)', () => {
    const fixture = setup({ citations: CITATIONS, webSearchQueries: [] });
    expect(q(fixture, 'grounded-queries')).toBeNull();
  });
});

describe('GroundedAttributionComponent — the empty state + disclosure', () => {
  it('renders NOTHING AT ALL when there is no grounded output', () => {
    const fixture = setup({});
    expect(q(fixture, 'grounded-attribution')).toBeNull();
    expect(q(fixture, 'grounded-disclosure')).toBeNull();
  });

  it('discloses the live web search whenever grounded output IS shown (ADR-225)', () => {
    const fixture = setup({ citations: CITATIONS, searchEntryPointHtml: CHIP_HTML });
    expect(q(fixture, 'grounded-disclosure')).not.toBeNull();
  });

  it('has no critical/serious a11y violations', async () => {
    const fixture = setup({
      citations: CITATIONS,
      searchEntryPointHtml: CHIP_HTML,
      webSearchQueries: ['shape of the earth'],
    });
    const axe = (await import('axe-core')).default;
    const results = await axe.run(fixture.nativeElement);
    const blocking = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(blocking.map((v) => v.id)).toEqual([]);
  });
});

/**
 * CHO-2185 — the DURABLE re-display path.
 *
 * A citation read back from a persisted research note has NO url: the redirect
 * uri expires (~30d) and was deliberately never stored. This component is the one
 * home for grounded attribution, so it has to render that shape too — and it must
 * not turn a missing link into a broken one. An <a href=""> points at the current
 * page: a source that looks clickable and goes nowhere is precisely the dead-link
 * failure D4 exists to prevent.
 */
describe('GroundedAttributionComponent — durable citations with no uri (CHO-2185)', () => {
  const DURABLE: readonly SeekerCitation[] = [
    { url: '', title: 'Earth is an oblate spheroid', snippet: 'Measurements confirm it.', domain: 'nasa.gov' },
    { url: '', title: 'esa.int', snippet: 'Geoid reference.', domain: 'esa.int' },
  ];

  it('renders a url-less source as plain text, NOT as a dead anchor', () => {
    const fixture = setup({ citations: DURABLE });

    const sources = q(fixture, 'grounded-sources')!;
    expect(sources).toBeTruthy();

    const anchors = sources.querySelectorAll('a');
    expect(anchors.length).toBe(0);

    // The domain still reaches the learner — it is the durable handle.
    expect(sources.textContent).toContain('nasa.gov');
    expect(sources.textContent).toContain('Earth is an oblate spheroid');
  });

  it('renders MULTIPLE url-less sources — an empty track key must not collide', () => {
    const fixture = setup({ citations: DURABLE });

    const items = q(fixture, 'grounded-sources')!.querySelectorAll('li');
    expect(items.length).toBe(2);
    expect(q(fixture, 'grounded-sources')!.textContent).toContain('esa.int');
  });

  it('still suppresses a title that merely repeats the domain', () => {
    const fixture = setup({ citations: [DURABLE[1]] });

    const text = q(fixture, 'grounded-sources')!.textContent ?? '';
    expect(text.split('esa.int').length - 1).toBe(1);
  });

  it('renders sources + "Searched for" and NO chip when the entry point is empty', () => {
    const fixture = setup({
      citations: DURABLE,
      webSearchQueries: ['shape of the earth'],
      searchEntryPointHtml: '',
    });

    expect(q(fixture, 'grounded-sources')).toBeTruthy();
    expect(q(fixture, 'grounded-queries')!.textContent).toContain('shape of the earth');
    // A persisted chip would be a wall of dead links — it must never be rendered.
    expect(q(fixture, 'grounded-chip')).toBeNull();
    expect(q(fixture, 'grounded-disclosure')).toBeTruthy();
  });

  it('still links a source that DOES carry a live uri (the far-sight path is unchanged)', () => {
    const fixture = setup({ citations: CITATIONS });

    const anchor = q(fixture, 'grounded-sources')!.querySelector('a');
    expect(anchor).toBeTruthy();
    expect(anchor!.getAttribute('href')).toBe(CITATIONS[0].url);
    expect(anchor!.getAttribute('rel')).toContain('noopener');
  });
});
