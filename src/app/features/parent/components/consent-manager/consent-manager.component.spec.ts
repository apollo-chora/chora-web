import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { ConsentManagerComponent } from './consent-manager.component';
import type { GuardianLink } from '../../models/parent.model';

describe('ConsentManagerComponent', () => {
  let component: ConsentManagerComponent;
  let fixture: ComponentFixture<ConsentManagerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConsentManagerComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(ConsentManagerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have data-testid attribute', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="consent-manager"]');
    expect(el).toBeTruthy();
  });

  it('should display page title', () => {
    const title = fixture.nativeElement.querySelector('[data-testid="consent-manager-title"]');
    expect(title).toBeTruthy();
  });

  it('should start with weekly frequency selected', () => {
    expect(component.selectedFrequency()).toBe('weekly');
  });

  it('should start with email channel selected', () => {
    expect(component.selectedChannels()).toEqual(['email']);
  });

  it('should update frequency on change', () => {
    const event = { target: { value: 'daily' } } as unknown as Event;
    component.onFrequencyChange(event);
    expect(component.selectedFrequency()).toBe('daily');
  });

  it('should toggle channel selection', () => {
    component.toggleChannel('push');
    expect(component.selectedChannels()).toContain('push');
    expect(component.selectedChannels()).toContain('email');

    component.toggleChannel('email');
    expect(component.selectedChannels()).not.toContain('email');
    expect(component.selectedChannels()).toContain('push');
  });

  it('should detect channel selection correctly', () => {
    expect(component.isChannelSelected('email')).toBe(true);
    expect(component.isChannelSelected('push')).toBe(false);
  });

  it('should compute statusClass correctly', () => {
    expect(component.statusClass('active')).toBe('consent-manager__status--active');
    expect(component.statusClass('revoked')).toBe('consent-manager__status--revoked');
  });

  it('should format date correctly', () => {
    const result = component.formatDate('2026-03-15T10:00:00Z');
    expect(result).toBeTruthy();
    expect(result).not.toBe('');
  });

  it('should return dash for null date', () => {
    expect(component.formatDate(null)).toBe('-');
  });

  it('should detect active links', () => {
    const activeLink = { status: 'active' } as GuardianLink;
    const pendingLink = { status: 'pending' } as GuardianLink;
    expect(component.isActive(activeLink)).toBe(true);
    expect(component.isActive(pendingLink)).toBe(false);
  });

  it('should compute totalLinks as 0 initially', () => {
    expect(component.totalLinks()).toBe(0);
  });

  it('should compute hasLinks as false initially', () => {
    expect(component.hasLinks()).toBe(false);
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
