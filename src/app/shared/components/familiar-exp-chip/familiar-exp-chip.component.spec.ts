import { beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';

import { FamiliarExpChipComponent } from './familiar-exp-chip.component';
import { TranslateService } from '../../../core/services/translate.service';

describe('FamiliarExpChipComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [FamiliarExpChipComponent],
      providers: [provideHttpClient(), TranslateService],
    });
  });

  it('renders +N with default 0 when no input set', () => {
    const fixture = TestBed.createComponent(FamiliarExpChipComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent ?? '').toContain('+0');
  });

  it('shows the EXP delta and applies is-capped on cap', () => {
    const fixture = TestBed.createComponent(FamiliarExpChipComponent);
    fixture.componentRef.setInput('expDelta', 3);
    fixture.componentRef.setInput('capped', true);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent ?? '').toContain('+3');
    expect(el.querySelector('.familiar-exp-chip')?.classList.contains('is-capped')).toBe(true);
  });
});
