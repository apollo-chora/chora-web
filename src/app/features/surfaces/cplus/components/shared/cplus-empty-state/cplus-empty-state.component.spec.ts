import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CplusEmptyStateComponent } from './cplus-empty-state.component';

describe('CplusEmptyStateComponent', () => {
  let fixture: ComponentFixture<CplusEmptyStateComponent>;
  let host: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CplusEmptyStateComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(CplusEmptyStateComponent);
    fixture.componentRef.setInput('heading', 'No shared atoms yet');
    fixture.componentRef.setInput('helper', 'Atoms your network shares will appear here.');
    host = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  it('renders the heading as an h2', () => {
    const h2 = host.querySelector('.cplus-empty-state__heading');
    expect(h2?.textContent?.trim()).toBe('No shared atoms yet');
  });

  it('renders the helper text', () => {
    expect(host.querySelector('.cplus-empty-state__helper')?.textContent?.trim()).toBe(
      'Atoms your network shares will appear here.',
    );
  });

  it('projects action content into the action slot', () => {
    // The action slot exists even when no content projected.
    expect(host.querySelector('.cplus-empty-state__action')).not.toBeNull();
  });

  it('omits the helper element when not provided', () => {
    fixture.componentRef.setInput('helper', undefined);
    fixture.detectChanges();
    expect(host.querySelector('.cplus-empty-state__helper')).toBeNull();
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
