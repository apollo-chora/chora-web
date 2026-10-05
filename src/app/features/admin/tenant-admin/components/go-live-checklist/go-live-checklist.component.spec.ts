import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { GoLiveChecklistComponent } from './go-live-checklist.component';

describe('GoLiveChecklistComponent', () => {
  let component: GoLiveChecklistComponent;
  let fixture: ComponentFixture<GoLiveChecklistComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GoLiveChecklistComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(GoLiveChecklistComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with 5 pending tests', () => {
    expect(component.tests().length).toBe(5);
    expect(component.tests().every((t) => t.status === 'pending')).toBe(true);
  });

  it('should start with 0% readiness score', () => {
    expect(component.readinessScore()).toBe(0);
    expect(component.passedCount()).toBe(0);
    expect(component.totalCount()).toBe(5);
  });

  it('should return correct status icons', () => {
    expect(component.getStatusIcon('pending')).toBe('radio_button_unchecked');
    expect(component.getStatusIcon('running')).toBe('sync');
    expect(component.getStatusIcon('passed')).toBe('check_circle');
    expect(component.getStatusIcon('failed')).toBe('error');
  });

  it('should return correct status classes', () => {
    expect(component.getStatusClass('pending')).toBe('go-live-checklist__status--pending');
    expect(component.getStatusClass('passed')).toBe('go-live-checklist__status--passed');
    expect(component.getStatusClass('failed')).toBe('go-live-checklist__status--failed');
    expect(component.getStatusClass('running')).toBe('go-live-checklist__status--running');
  });

  it('should not be all passed initially', () => {
    expect(component.allPassed()).toBe(false);
  });
});
