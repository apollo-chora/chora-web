import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CplusCardComponent } from './cplus-card.component';

describe('CplusCardComponent', () => {
  let fixture: ComponentFixture<CplusCardComponent>;
  let host: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CplusCardComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(CplusCardComponent);
    host = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  it('renders a native <article> with no role override by default', () => {
    const article = host.querySelector('article.cplus-card');
    expect(article).not.toBeNull();
    // The implicit `article` role must survive: role="feed" accepts no other
    // child role, and the old hard-coded role="group" broke exactly that.
    expect(article?.getAttribute('role')).toBeNull();
  });

  it('applies a container-supplied role so a card can be a list item', () => {
    fixture.componentRef.setInput('cardRole', 'listitem');
    fixture.detectChanges();
    const article = host.querySelector('article.cplus-card');
    expect(article?.getAttribute('role')).toBe('listitem');
  });

  it('projects header content into the labelled header slot', () => {
    fixture.componentRef.setInput('title', 'Shared atoms');
    fixture.detectChanges();
    const heading = host.querySelector('.cplus-card__title');
    expect(heading?.textContent?.trim()).toBe('Shared atoms');
  });

  it('projects body content via ng-content', () => {
    // Body slot uses default projection.
    expect(host.querySelector('.cplus-card__body')).not.toBeNull();
  });

  it('omits the title element when no title input is given', () => {
    const heading = host.querySelector('.cplus-card__title');
    expect(heading).toBeNull();
  });

  it('exposes an accessible label via aria-label when title is set', () => {
    fixture.componentRef.setInput('title', 'Leaderboard');
    fixture.detectChanges();
    const article = host.querySelector('article.cplus-card');
    expect(article?.getAttribute('aria-label')).toBe('Leaderboard');
  });

  it('applies the surface/elevated variant via data-elevation', () => {
    fixture.componentRef.setInput('elevation', 'raised');
    fixture.detectChanges();
    const article = host.querySelector('article.cplus-card');
    expect(article?.getAttribute('data-elevation')).toBe('raised');
  });

  it('has no critical/serious axe violations', async () => {
    fixture.componentRef.setInput('title', 'Card');
    fixture.detectChanges();
    const axe = (await import('axe-core')).default;
    const results = await axe.run(host);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
  });
});
