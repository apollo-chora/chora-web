import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CplusPageHeaderComponent } from './cplus-page-header.component';
import { CplusBreadcrumbItem } from '../cplus-breadcrumb/cplus-breadcrumb.component';

describe('CplusPageHeaderComponent', () => {
  let fixture: ComponentFixture<CplusPageHeaderComponent>;
  let host: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CplusPageHeaderComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(CplusPageHeaderComponent);
    fixture.componentRef.setInput('title', 'Feed');
    fixture.componentRef.setInput('description', 'Atoms shared by your network');
    fixture.componentRef.setInput('breadcrumb', [
      { label: 'C+', path: '/c/feed' },
      { label: 'Feed', path: null },
    ] as CplusBreadcrumbItem[]);
    host = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  it('renders a <header role="banner">', () => {
    expect(host.querySelector('header[role="banner"]')).not.toBeNull();
  });

  it('renders a flat (non-gradient) h1 title', () => {
    const h1 = host.querySelector('h1.cplus-page-header__title');
    expect(h1?.textContent?.trim()).toBe('Feed');
    // Anti-slop guard: the title must NOT carry the gradient-text class.
    expect(h1?.classList.contains('surface-accent-text')).toBe(false);
  });

  it('renders the description subtitle', () => {
    expect(host.querySelector('.cplus-page-header__description')?.textContent?.trim()).toBe(
      'Atoms shared by your network',
    );
  });

  it('renders the breadcrumb inside the header', () => {
    expect(host.querySelector('chora-cplus-breadcrumb')).not.toBeNull();
  });

  it('projects action content into the actions slot', () => {
    expect(host.querySelector('.cplus-page-header__actions')).not.toBeNull();
  });

  it('omits the description element when not provided', () => {
    fixture.componentRef.setInput('description', undefined);
    fixture.detectChanges();
    expect(host.querySelector('.cplus-page-header__description')).toBeNull();
  });

  it('has no critical/serious axe violations', async () => {
    const axe = (await import('axe-core')).default;
    const results = await axe.run(host);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
  });
});
