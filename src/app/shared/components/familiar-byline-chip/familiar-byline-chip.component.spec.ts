import { beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';

import { FamiliarBylineChipComponent } from './familiar-byline-chip.component';

describe('FamiliarBylineChipComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [FamiliarBylineChipComponent] });
  });

  it('renders the breed-adjective stage label', () => {
    const fixture = TestBed.createComponent(FamiliarBylineChipComponent);
    fixture.componentRef.setInput('species', 'dragon');
    fixture.componentRef.setInput('stage', 5);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent ?? '').toContain('Teen Dragon');
  });

  it('renders generic Stage N for unknown species (empty string)', () => {
    const fixture = TestBed.createComponent(FamiliarBylineChipComponent);
    fixture.componentRef.setInput('species', '');
    fixture.componentRef.setInput('stage', 3);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent ?? '').toContain('Stage 3');
  });

  it('renders the data-testid chip element with breed accent (F5 regression)', () => {
    const fixture = TestBed.createComponent(FamiliarBylineChipComponent);
    fixture.componentRef.setInput('species', 'dragon');
    fixture.componentRef.setInput('stage', 1);
    fixture.detectChanges();
    const chip = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="familiar-byline-chip"]',
    );
    expect(chip).not.toBeNull();
    expect(chip!.getAttribute('data-breed')).toBe('dragon');
    expect(chip!.textContent ?? '').toContain('Hatchling');
  });
});
