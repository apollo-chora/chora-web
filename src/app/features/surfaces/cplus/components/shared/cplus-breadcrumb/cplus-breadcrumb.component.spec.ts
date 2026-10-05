import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CplusBreadcrumbComponent, CplusBreadcrumbItem } from './cplus-breadcrumb.component';

describe('CplusBreadcrumbComponent', () => {
  let fixture: ComponentFixture<CplusBreadcrumbComponent>;
  let host: HTMLElement;

  const items: CplusBreadcrumbItem[] = [
    { label: 'C+', path: '/c/feed' },
    { label: 'Leaderboards', path: null },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CplusBreadcrumbComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(CplusBreadcrumbComponent);
    fixture.componentRef.setInput('items', items);
    host = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  it('renders a <nav> with aria-label Breadcrumb', () => {
    const nav = host.querySelector('nav[aria-label="Breadcrumb"]');
    expect(nav).not.toBeNull();
  });

  it('renders an ordered list of crumbs', () => {
    const lis = host.querySelectorAll('ol.cplus-breadcrumb__list > li');
    expect(lis.length).toBe(2);
  });

  it('marks the final crumb aria-current page', () => {
    const last = host.querySelector('ol.cplus-breadcrumb__list > li:last-child');
    expect(last?.getAttribute('aria-current')).toBe('page');
  });

  it('renders intermediate crumbs as links, the last as plain text', () => {
    const firstLink = host.querySelector<HTMLAnchorElement>(
      'ol.cplus-breadcrumb__list > li:first-child a',
    );
    expect(firstLink?.getAttribute('href')).toBe('/c/feed');
    const lastLink = host.querySelector('ol.cplus-breadcrumb__list > li:last-child a');
    expect(lastLink).toBeNull();
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
