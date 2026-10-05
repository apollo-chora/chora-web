import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReadonlyBannerComponent } from './readonly-banner.component';

describe('ReadonlyBannerComponent', () => {
  let component: ReadonlyBannerComponent;
  let fixture: ComponentFixture<ReadonlyBannerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReadonlyBannerComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ReadonlyBannerComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('isReadOnly', true);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display banner when read-only is true', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="readonly-banner"]');
    expect(el).toBeTruthy();
  });

  it('should hide banner when read-only is false', () => {
    fixture.componentRef.setInput('isReadOnly', false);
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector('[data-testid="readonly-banner"]');
    expect(el).toBeFalsy();
  });

  it('should have role="status"', () => {
    const el = fixture.nativeElement.querySelector('[role="status"]');
    expect(el).toBeTruthy();
  });

  it('should not have a dismiss button (persistent banner)', () => {
    const btn = fixture.nativeElement.querySelector('button');
    expect(btn).toBeFalsy();
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
