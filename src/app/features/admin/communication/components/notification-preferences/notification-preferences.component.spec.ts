import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { NotificationPreferencesComponent } from './notification-preferences.component';
import type { EventCategory, NotificationChannel } from '../../models/communication.model';

describe('NotificationPreferencesComponent', () => {
  let component: NotificationPreferencesComponent;
  let fixture: ComponentFixture<NotificationPreferencesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NotificationPreferencesComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(NotificationPreferencesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have data-testid attribute', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="notification-preferences"]');
    expect(el).toBeTruthy();
  });

  it('should default quiet hours start and end', () => {
    expect(component.quietHoursStart()).toBe('22:00');
    expect(component.quietHoursEnd()).toBe('07:00');
  });

  it('should update quiet hours', () => {
    component.onQuietHoursStartChange('23:00');
    expect(component.quietHoursStart()).toBe('23:00');
    component.onQuietHoursEndChange('08:00');
    expect(component.quietHoursEnd()).toBe('08:00');
  });

  it('should generate toggleId correctly', () => {
    expect(component.toggleId('engagement' as EventCategory, 'email' as NotificationChannel)).toBe(
      'pref-engagement-email',
    );
  });

  // The device-push opt-in was removed with the FCM/Firebase extraction.
  it('does not render the device-push opt-in', () => {
    expect(fixture.nativeElement.querySelector('[data-testid="device-push"]')).toBeNull();
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
