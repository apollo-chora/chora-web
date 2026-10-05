import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  inject,
  computed,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { FamiliarChatService } from '../../services/familiar-chat.service';
import type { PersonaSnapshot } from '../../models/familiar-chat.model';

@Component({
  selector: 'chora-familiar-persona-card',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './familiar-persona-card.component.html',
  styleUrl: './familiar-persona-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FamiliarPersonaCardComponent implements OnInit, OnDestroy {
  private readonly chatService = inject(FamiliarChatService);

  readonly personaState = this.chatService.personaState;

  readonly persona = computed<PersonaSnapshot | null>(() => {
    const state = this.personaState();
    return state.status === 'success' ? state.persona : null;
  });

  readonly traits = computed(() => {
    const p = this.persona();
    if (!p) return [];
    return [
      { key: 'curiosity', value: p.stats.curiosity },
      { key: 'encouragement', value: p.stats.encouragement },
      { key: 'humor', value: p.stats.humor },
      { key: 'detail', value: p.stats.detail },
      { key: 'formality', value: p.stats.formality },
    ];
  });

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.subscriptions.add(
      this.chatService.loadPersona().subscribe(),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  archetypeInitial(): string {
    const p = this.persona();
    if (!p) return '?';
    return p.archetype.charAt(0).toUpperCase();
  }
}
