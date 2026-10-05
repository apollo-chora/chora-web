import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RestrictedNavComponent } from './restricted-nav.component';
import type { NavItem } from './restricted-nav.component';
import type { RestrictedCapability } from '../../../features/admin/governance/models/escalation.model';

describe('RestrictedNavComponent', () => {
  let component: RestrictedNavComponent;
  let fixture: ComponentFixture<RestrictedNavComponent>;

  const mockNavItems: NavItem[] = [
    { route: '/dashboard', label_key: 'nav.dashboard', icon: 'D' },
    { route: '/learning', label_key: 'nav.learning', icon: 'L' },
    { route: '/admin', label_key: 'nav.admin', icon: 'A' },
  ];

  const mockRestrictions: RestrictedCapability[] = [
    { route: '/admin', label_key: 'nav.admin', reason: 'Access suspended', is_restricted: true },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RestrictedNavComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(RestrictedNavComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('navItems', mockNavItems);
    fixture.componentRef.setInput('restrictions', mockRestrictions);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have data-testid attribute', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="restricted-nav"]');
    expect(el).toBeTruthy();
  });

  it('should identify restricted routes', () => {
    expect(component.isRestricted('/admin')).toBe(true);
    expect(component.isRestricted('/dashboard')).toBe(false);
  });

  it('should return restriction reason', () => {
    expect(component.getRestrictionReason('/admin')).toBe('Access suspended');
    expect(component.getRestrictionReason('/dashboard')).toBe('');
  });

  it('should show all items when hideRestricted is false', () => {
    expect(component.visibleItems().length).toBe(3);
  });

  it('should hide restricted items when hideRestricted is true', () => {
    fixture.componentRef.setInput('hideRestricted', true);
    fixture.detectChanges();
    expect(component.visibleItems().length).toBe(2);
  });

  it('should return correct item class', () => {
    expect(component.itemClass('/admin')).toContain('--restricted');
    expect(component.itemClass('/dashboard')).not.toContain('--restricted');
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
