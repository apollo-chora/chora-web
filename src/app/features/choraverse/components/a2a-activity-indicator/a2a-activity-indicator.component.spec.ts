import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { A2AActivityIndicatorComponent } from './a2a-activity-indicator.component';

describe('A2AActivityIndicatorComponent', () => {
  let component: A2AActivityIndicatorComponent;
  let fixture: ComponentFixture<A2AActivityIndicatorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [A2AActivityIndicatorComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(A2AActivityIndicatorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should default to chat closed', () => {
    expect(component.isChatOpen()).toBe(false);
  });

  it('should default to tooltip hidden', () => {
    expect(component.isTooltipVisible()).toBe(false);
  });

  it('should toggle chat open/closed', () => {
    component.toggleChat();
    expect(component.isChatOpen()).toBe(true);
    component.toggleChat();
    expect(component.isChatOpen()).toBe(false);
  });

  it('should show and hide tooltip', () => {
    component.showTooltip();
    expect(component.isTooltipVisible()).toBe(true);
    component.hideTooltip();
    expect(component.isTooltipVisible()).toBe(false);
  });

  it('should close chat', () => {
    component.toggleChat();
    component.closeChat();
    expect(component.isChatOpen()).toBe(false);
  });

  it('should format timestamp', () => {
    const result = component.formatTimestamp('2026-03-21T14:30:00Z');
    expect(result).toBeTruthy();
  });

  it('should return empty string for null primary task tooltip', () => {
    expect(component.tooltipText()).toBe('');
  });

  it('should have no critical accessibility violations', async () => {
    const axe = (await import('axe-core')).default;
    const results = await axe.run(fixture.nativeElement);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
  });
});
