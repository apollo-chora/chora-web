import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LiveAnnouncer } from '@angular/cdk/a11y';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TranslateService } from '../../../../../../core/services/translate.service';
import { CplusTabsComponent, CplusTabItem } from './cplus-tabs.component';

describe('CplusTabsComponent', () => {
  let fixture: ComponentFixture<CplusTabsComponent>;
  let host: HTMLElement;
  const announceSpy = vi.fn();
  const announcerStub = { announce: announceSpy } as unknown as LiveAnnouncer;

  const tabs: CplusTabItem[] = [
    { id: 'global', label: 'Global' },
    { id: 'tenant', label: 'Tenant' },
    { id: 'class', label: 'Class' },
  ];

  let httpMock: HttpTestingController;

  beforeEach(async () => {
    announceSpy.mockClear();
    await TestBed.configureTestingModule({
      imports: [CplusTabsComponent],
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        TranslateService,
        { provide: LiveAnnouncer, useValue: announcerStub },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(CplusTabsComponent);
    fixture.componentRef.setInput('tabs', tabs);
    host = fixture.nativeElement as HTMLElement;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('renders a tablist with the correct ARIA roles', () => {
    expect(host.querySelector('[role="tablist"]')).not.toBeNull();
    expect(host.querySelectorAll('[role="tab"]').length).toBe(3);
  });

  it('marks the active tab aria-selected true and others false', () => {
    const all = host.querySelectorAll<HTMLElement>('[role="tab"]');
    expect(all[0].getAttribute('aria-selected')).toBe('true');
    expect(all[1].getAttribute('aria-selected')).toBe('false');
    expect(all[2].getAttribute('aria-selected')).toBe('false');
  });

  it('roves tabindex — active tab is 0, others are -1', () => {
    const all = host.querySelectorAll<HTMLElement>('[role="tab"]');
    expect(all[0].getAttribute('tabindex')).toBe('0');
    expect(all[1].getAttribute('tabindex')).toBe('-1');
    expect(all[2].getAttribute('tabindex')).toBe('-1');
  });

  it('moves selection to the next tab on ArrowRight', () => {
    const second = host.querySelectorAll<HTMLElement>('[role="tab"]')[1];
    second.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    const all = host.querySelectorAll<HTMLElement>('[role="tab"]');
    // ArrowRight from index 1 advances to index 2 (the third tab).
    expect(all[2].getAttribute('aria-selected')).toBe('true');
    expect(all[2].getAttribute('tabindex')).toBe('0');
    expect(all[0].getAttribute('aria-selected')).toBe('false');
    expect(all[1].getAttribute('aria-selected')).toBe('false');
  });

  it('wraps to the last tab on ArrowLeft from the first', () => {
    const first = host.querySelectorAll<HTMLElement>('[role="tab"]')[0];
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    fixture.detectChanges();
    const last = host.querySelectorAll<HTMLElement>('[role="tab"]')[2];
    expect(last.getAttribute('aria-selected')).toBe('true');
  });

  it('jumps to the first tab on Home', () => {
    // Select the last tab first.
    const last = host.querySelectorAll<HTMLElement>('[role="tab"]')[2];
    last.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    fixture.detectChanges();
    last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    fixture.detectChanges();
    const first = host.querySelectorAll<HTMLElement>('[role="tab"]')[0];
    expect(first.getAttribute('aria-selected')).toBe('true');
  });

  it('emits activeChange when a tab is clicked', () => {
    let emitted: string | undefined;
    fixture.componentInstance.activeChange.subscribe((id) => (emitted = id));
    const second = host.querySelectorAll<HTMLElement>('[role="tab"]')[1];
    second.click();
    fixture.detectChanges();
    expect(emitted).toBe('tenant');
  });

  it('uses a flat underline indicator, not a gradient pill', () => {
    const indicator = host.querySelector('.cplus-tabs__indicator');
    expect(indicator).not.toBeNull();
    // Anti-slop guard: no gradient marker class.
    expect(indicator?.classList.contains('gradient-pill')).toBe(false);
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
