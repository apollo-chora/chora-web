import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { XpWidgetComponent } from './xp-widget.component';
import type { XpSummaryData } from '../../models/engagement.models';

describe('XpWidgetComponent', () => {
  let fixture: ComponentFixture<XpWidgetComponent>;
  let component: XpWidgetComponent;

  const mockXp: XpSummaryData = {
    total_xp: 1250,
    level: 5,
    xp_to_next_level: 350,
    combo_multiplier: 2,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [XpWidgetComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(XpWidgetComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('xp', mockXp);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should compute progress percent', () => {
    const percent = component.progressPercent();
    expect(percent).toBeGreaterThanOrEqual(0);
    expect(percent).toBeLessThanOrEqual(100);
  });

  it('should return 100 when xp_to_next_level is 0', () => {
    fixture.componentRef.setInput('xp', { ...mockXp, xp_to_next_level: 0 });
    fixture.detectChanges();
    expect(component.progressPercent()).toBe(100);
  });
});
