import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { CampaignAdminComponent } from './campaign-admin.component';

describe('CampaignAdminComponent', () => {
  let component: CampaignAdminComponent;
  let fixture: ComponentFixture<CampaignAdminComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CampaignAdminComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(CampaignAdminComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have data-testid attribute', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="campaign-admin"]');
    expect(el).toBeTruthy();
  });

  it('should start in list view mode', () => {
    expect(component.viewMode()).toBe('list');
  });

  it('should switch to wizard view', () => {
    component.showWizard();
    expect(component.viewMode()).toBe('wizard');
  });

  it('should navigate wizard steps forward and backward', () => {
    component.showWizard();
    expect(component.wizardStep()).toBe('budget');

    component.nextStep();
    expect(component.wizardStep()).toBe('audience');

    component.nextStep();
    expect(component.wizardStep()).toBe('review');

    component.prevStep();
    expect(component.wizardStep()).toBe('audience');
  });

  it('should format price correctly', () => {
    expect(component.formatPrice(5000, 'usd')).toContain('50.00');
  });

  it('should return correct status class', () => {
    expect(component.statusClass('active')).toBe('campaign-admin__status--active');
  });

  it('should format percent correctly', () => {
    expect(component.formatPercent(0.125)).toBe('12.5%');
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
