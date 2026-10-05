import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PricingPageComponent } from './pricing-page.component';

describe('PricingPageComponent', () => {
  let component: PricingPageComponent;
  let fixture: ComponentFixture<PricingPageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PricingPageComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(PricingPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start with no add-ons selected', () => {
    expect(component.selectedCount()).toBe(0);
    expect(component.totalMonthly()).toBe(0);
  });

  it('should toggle add-on selection and update total', () => {
    component.toggleAddOn('knowledge_graph');
    expect(component.isSelected('knowledge_graph')).toBe(true);
    expect(component.totalMonthly()).toBe(29);

    component.toggleAddOn('choraverse');
    expect(component.totalMonthly()).toBe(48);

    component.toggleAddOn('knowledge_graph');
    expect(component.isSelected('knowledge_graph')).toBe(false);
    expect(component.totalMonthly()).toBe(19);
  });

  it('should toggle comparison matrix visibility', () => {
    expect(component.showComparison()).toBe(false);
    component.toggleComparison();
    expect(component.showComparison()).toBe(true);
    component.toggleComparison();
    expect(component.showComparison()).toBe(false);
  });

  it('should detect feature presence correctly', () => {
    const addOn = component.catalog[0];
    expect(component.hasFeature(addOn, addOn.features[0])).toBe(true);
    expect(component.hasFeature(addOn, 'nonexistent_feature')).toBe(false);
  });

  it('should have a catalog of add-ons', () => {
    expect(component.catalog.length).toBeGreaterThan(0);
    expect(component.catalog.every((a) => a.code && a.name && a.price_monthly >= 0)).toBe(true);
  });

  it('should compute all unique features', () => {
    expect(component.allFeatures().length).toBeGreaterThan(0);
  });
});
