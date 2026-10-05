import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GovernanceWarningBannerComponent } from './governance-warning-banner.component';

describe('GovernanceWarningBannerComponent', () => {
  let component: GovernanceWarningBannerComponent;
  let fixture: ComponentFixture<GovernanceWarningBannerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GovernanceWarningBannerComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(GovernanceWarningBannerComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('warningState', {
      current_count: 2,
      max_before_escalation: 3,
      acknowledged: false,
      latest_message: 'You have received a governance warning.',
    });
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display banner when warning state is active', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="governance-warning-banner"]');
    expect(el).toBeTruthy();
  });

  it('should show correct warning count', () => {
    expect(component.warningCount()).toBe(2);
    expect(component.maxWarnings()).toBe(3);
  });

  it('should hide banner when acknowledged', () => {
    fixture.componentRef.setInput('warningState', {
      current_count: 2,
      max_before_escalation: 3,
      acknowledged: true,
      latest_message: 'You have received a governance warning.',
    });
    fixture.detectChanges();
    expect(component.isVisible()).toBe(false);
  });

  it('should hide banner when count is 0', () => {
    fixture.componentRef.setInput('warningState', {
      current_count: 0,
      max_before_escalation: 3,
      acknowledged: false,
      latest_message: '',
    });
    fixture.detectChanges();
    expect(component.isVisible()).toBe(false);
  });

  it('should have role alert attribute', () => {
    const el = fixture.nativeElement.querySelector('[role="alert"]');
    expect(el).toBeTruthy();
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
