import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { FirstInteractionTutorialComponent } from './first-interaction-tutorial.component';
import { FamiliarService } from '../../services/familiar.service';
import { FamiliarChatService } from '../../services/familiar-chat.service';
import { TranslateService } from '../../../../core/services/translate.service';

describe('FirstInteractionTutorialComponent', () => {
  let fixture: ComponentFixture<FirstInteractionTutorialComponent>;
  let component: FirstInteractionTutorialComponent;

  const familiarMock = {
    state: signal({ status: 'success', profile: { speciesType: 'fox' } }),
    justSummoned: signal(true),
  };

  const chatMock = {
    sendMessage: vi.fn(),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FirstInteractionTutorialComponent],
      providers: [
        provideRouter([]),
        { provide: FamiliarService, useValue: familiarMock },
        { provide: FamiliarChatService, useValue: chatMock },
        { provide: TranslateService, useValue: { instant: (key: string) => key } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(FirstInteractionTutorialComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should start at step 0', () => {
    fixture.detectChanges();
    expect(component.currentStep()).toBe(0);
    expect(component.isLastStep()).toBe(false);
  });

  it('should advance to next step', () => {
    fixture.detectChanges();

    component.selectChip(component.step().responseChips[0]);
    component.nextStep();

    expect(component.currentStep()).toBe(1);
    expect(component.hasResponded()).toBe(false);
  });

  it('should prevent double chip selection in same step', () => {
    fixture.detectChanges();

    chatMock.sendMessage.mockClear();
    component.selectChip(component.step().responseChips[0]);
    expect(component.hasResponded()).toBe(true);

    component.selectChip(component.step().responseChips[1]);
    // Second chip should be ignored because hasResponded is true
    expect(chatMock.sendMessage).toHaveBeenCalledTimes(1);
  });
});
