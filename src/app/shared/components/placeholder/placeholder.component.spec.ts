import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PlaceholderComponent } from './placeholder.component';

describe('PlaceholderComponent', () => {
  let fixture: ComponentFixture<PlaceholderComponent>;
  let component: PlaceholderComponent;
  let element: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlaceholderComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(PlaceholderComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement;
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should display default title', () => {
    fixture.detectChanges();
    expect(element.querySelector('h2')?.textContent?.trim()).toBe('Coming Soon');
  });

  it('should display custom title via input', () => {
    fixture.componentRef.setInput('title', 'Under Construction');
    fixture.detectChanges();
    expect(element.querySelector('h2')?.textContent?.trim()).toBe('Under Construction');
  });
});
