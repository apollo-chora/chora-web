import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TransactionHistoryComponent } from './transaction-history.component';
import type { CoinTransaction } from '../../models/gamification.model';

describe('TransactionHistoryComponent', () => {
  let component: TransactionHistoryComponent;
  let fixture: ComponentFixture<TransactionHistoryComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TransactionHistoryComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(TransactionHistoryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have data-testid attribute', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="transaction-history"]');
    expect(el).toBeTruthy();
  });

  it('should compute amountPrefix correctly', () => {
    expect(component.amountPrefix({ amount: 100 } as CoinTransaction)).toBe('+');
    expect(component.amountPrefix({ amount: -50 } as CoinTransaction)).toBe('');
    expect(component.amountPrefix({ amount: 0 } as CoinTransaction)).toBe('+');
  });

  it('should compute amountClass correctly', () => {
    expect(component.amountClass(100)).toBe('transaction-history__amount--positive');
    expect(component.amountClass(-50)).toBe('transaction-history__amount--negative');
    expect(component.amountClass(0)).toBe('');
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
