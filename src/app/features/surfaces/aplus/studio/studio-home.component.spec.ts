/**
 * StudioHomeComponent spec — CHO-2215.
 *
 * `/a/studio` — the authoring surface's front door. Modelled on
 * `question-bank-workbench-list`, the one A+ authoring surface that was already
 * built to the right shape: title, purpose line, primary action top-right, cards.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { StudioHomeComponent } from './studio-home.component';

describe('StudioHomeComponent', () => {
  let fixture: ComponentFixture<StudioHomeComponent>;
  let element: HTMLElement;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [StudioHomeComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(StudioHomeComponent);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  it('renders a single h1 titling the surface', () => {
    const h1 = element.querySelectorAll('h1');
    expect(h1.length).toBe(1);
    expect(h1[0].textContent?.trim().length).toBeGreaterThan(0);
  });

  it('renders a purpose line under the title', () => {
    expect(element.querySelector('[data-testid="studio-home-subtitle"]')).not.toBeNull();
  });

  it('offers "New learning atom" as the primary action, linking to the canvas', () => {
    const cta = element.querySelector<HTMLAnchorElement>('[data-testid="studio-home-new-atom"]');
    expect(cta).not.toBeNull();
    expect(cta?.tagName).toBe('A');
    expect(cta?.getAttribute('href')).toBe('/a/studio/atoms/new');
  });

  it('mounts the Studio sub-nav', () => {
    expect(element.querySelector('[data-testid="studio-sub-nav"]')).not.toBeNull();
  });

  it.each([
    ['studio-card-atoms', '/a/studio/atoms'],
    ['studio-card-test-sets', '/a/studio/test-sets'],
    ['studio-card-question-banks', '/a/studio/question-banks'],
  ])('renders the %s card linking to %s', (testid, href) => {
    const card = element.querySelector<HTMLAnchorElement>(`[data-testid="${testid}"]`);
    expect(card).not.toBeNull();
    expect(card?.tagName).toBe('A');
    expect(card?.getAttribute('href')).toBe(href);
  });

  it('renders no Courses card', () => {
    expect(element.innerHTML).not.toContain('/a/courses/new');
    expect(element.querySelector('[data-testid="studio-card-courses"]')).toBeNull();
  });

  it('uses no em dash in rendered copy (house rule)', () => {
    expect(element.textContent).not.toContain('—');
  });
});
