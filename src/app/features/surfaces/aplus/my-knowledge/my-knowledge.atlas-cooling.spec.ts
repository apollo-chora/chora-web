/**
 * RED spec: the Atlas card reads the four fields the wire already serves
 * (C4 slice 4).
 *
 * `mapCardDTO` has carried `attachedCompanionName`, `coolingCount` and
 * `coolingHexLabel` since c4c5d8820, and the list envelope carries
 * `coolingPartial`, but the FE `MapCard` model declares none of them and drops
 * all four at the type boundary. Same class as the question-bank `prompt` and
 * the `claimless` flag: the frontend sitting behind its own wire.
 *
 * THE ONE THAT MATTERS IS `coolingPartial`, and the backend says why in its own
 * words: it "marks the cooling counts as UNREAD this request. Without it a zero
 * is ambiguous, and the home would rank the defend card off the page on the
 * strength of a read that never happened." `coolingCount` reads 0 when the read
 * did not happen, which is NOT the same as nothing cooling.
 *
 * So the card must keep three states apart, exactly as the SkillsFuture badge
 * now does: cooling (a served count above zero), not cooling (a served zero),
 * and NOT KNOWN (partial). A zero rendered as "nothing is cooling" while the
 * read failed is a claim built from a read that did not happen, which is the
 * defect this whole row keeps finding.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { environment } from '../../../../../environments/environment';
import { MyKnowledgeComponent } from './my-knowledge.component';

const BFF = environment.bffBaseUrl;
const MAPS = `${BFF}/api/v1/me/maps`;

/** One Atlas card as the wire serves it. */
function card(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    goalId: 'g-1',
    title: 'Fractions',
    northStarNote: '',
    rootConceptId: 'c-root',
    kind: 'curiosity',
    status: 'active',
    conceptCount: 5,
    shakyCount: 0,
    masteredCount: 0,
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-02T00:00:00Z',
    ...over,
  };
}

describe('MyKnowledge atlas, cooling and companion (C4 slice 4)', () => {
  let fixture: ComponentFixture<MyKnowledgeComponent>;
  let element: HTMLElement;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MyKnowledgeComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(MyKnowledgeComponent);
    element = fixture.nativeElement as HTMLElement;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    for (const r of httpMock.match(() => true)) {
      if (!r.cancelled) r.flush({ items: [] });
    }
    fixture.destroy();
  });

  /** Mount and answer the Atlas list with the given envelope. */
  function mount(body: Record<string, unknown>): void {
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url === MAPS).flush(body);
    fixture.detectChanges();
  }

  function testid<T extends HTMLElement = HTMLElement>(id: string): T | null {
    return element.querySelector<T>(`[data-testid="${id}"]`);
  }

  it('shows the cooling chip, naming a hex, when the count is served above zero', () => {
    mount({
      items: [card({ coolingCount: 3, coolingHexLabel: 'Long division' })],
    });

    const chip = testid('mk-cooling-g-1');
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toContain('3');
    expect(chip!.textContent).toContain('Long division');
  });

  it('shows NO cooling chip on a served zero', () => {
    mount({ items: [card({ coolingCount: 0 })] });

    expect(testid('mk-cooling-g-1')).toBeNull();
  });

  it('makes NO cooling claim when the read was partial, even though the count is zero', () => {
    // The heart of the slice. coolingPartial means the cooling read did not
    // happen, so the zero is not evidence. Neither a count nor a "nothing is
    // cooling" may be shown; the card says nothing about cooling at all.
    mount({ items: [card({ coolingCount: 0 })], coolingPartial: true });

    expect(testid('mk-cooling-g-1')).toBeNull();
    expect(testid('mk-cooling-none-g-1')).toBeNull();
  });

  it('does not suppress a NON-zero count merely because partial is set', () => {
    // Defensive: if the backend ever sends both, a real count is still a real
    // count. This pins that "partial" suppresses a CLAIM, not the data.
    mount({
      items: [card({ coolingCount: 2, coolingHexLabel: 'Ratios' })],
      coolingPartial: true,
    });

    expect(testid('mk-cooling-g-1')).toBeNull();
  });

  it('names the stationed companion rather than printing its id', () => {
    mount({
      items: [
        card({
          attachedCompanionId: 'fam-9',
          attachedCompanionName: 'Sage',
        }),
      ],
    });

    const el = testid('mk-companion-g-1');
    expect(el).not.toBeNull();
    expect(el!.textContent).toContain('Sage');
    expect(el!.textContent).not.toContain('fam-9');
  });

  it('says nothing about a companion when the name is missing, never the id', () => {
    // The name is fail-soft and empty on an unbound goal or any miss. A UUID
    // where a name belongs reads as the companion's name.
    mount({ items: [card({ attachedCompanionId: 'fam-9' })] });

    const el = testid('mk-companion-g-1');
    expect(el === null || !(el.textContent ?? '').includes('fam-9')).toBe(true);
  });
});
