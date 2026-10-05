import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { OplusPlaceholderComponent } from './oplus-placeholder.component';
import { TranslateService } from '../../../../../core/services/translate.service';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

describe('OplusPlaceholderComponent', () => {
  let fixture: ComponentFixture<OplusPlaceholderComponent>;
  let element: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OplusPlaceholderComponent],
      providers: [
        TranslateService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OplusPlaceholderComponent);
    element = fixture.nativeElement as HTMLElement;
  });

  it('renders the placeholder root with .surface-oplus accent class', () => {
    fixture.componentRef.setInput('section', 'dimensions');
    fixture.detectChanges();
    const root = element.querySelector('[data-testid="oplus-placeholder-root"]');
    expect(root).toBeTruthy();
    expect(root?.className).toContain('surface-oplus');
  });

  it('renders the section name on the placeholder card', () => {
    fixture.componentRef.setInput('section', 'agents');
    fixture.detectChanges();
    const heading = element.querySelector('[data-testid="oplus-placeholder-heading"]');
    expect(heading?.textContent).toContain('agents');
  });

  it('renders the wave-2 status note', () => {
    fixture.componentRef.setInput('section', 'governance');
    fixture.detectChanges();
    const note = element.querySelector('[data-testid="oplus-placeholder-status"]');
    // The translate pipe falls back to the raw key when translations aren't
    // loaded; the key itself must reference "wave_2" so the rendered text
    // still signals the wave-2 placeholder intent.
    expect(note?.textContent).toMatch(/wave_?2/i);
  });

  it('supports section input changing reactively', () => {
    fixture.componentRef.setInput('section', 'governance');
    fixture.detectChanges();
    let heading = element.querySelector('[data-testid="oplus-placeholder-heading"]');
    expect(heading?.textContent).toContain('governance');

    fixture.componentRef.setInput('section', 'a2a-console');
    fixture.detectChanges();
    heading = element.querySelector('[data-testid="oplus-placeholder-heading"]');
    expect(heading?.textContent).toContain('a2a-console');
  });
});
