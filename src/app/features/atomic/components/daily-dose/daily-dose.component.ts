import {
  Component, ChangeDetectionStrategy, inject, OnInit, OnDestroy,
  HostListener, computed,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ComboMeterComponent } from '../combo-meter/combo-meter.component';
import { DailyDoseService } from '../../services/daily-dose.service';
import { LandingService } from '../../../../core/auth/landing.service';
import { LearningAtom, ATOM_TYPE_ICONS, DailyDoseCard } from '../../models/atom.models';

@Component({
  selector: 'chora-daily-dose',
  imports: [TranslatePipe, ComboMeterComponent],
  templateUrl: './daily-dose.component.html',
  styleUrl: './daily-dose.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DailyDoseComponent implements OnInit, OnDestroy {
  private readonly doseService = inject(DailyDoseService);
  private readonly router = inject(Router);
  private readonly landing = inject(LandingService);

  readonly doseState = this.doseService.doseState;
  readonly cards = this.doseService.cards;
  readonly currentIndex = this.doseService.currentIndex;
  readonly currentCard = this.doseService.currentCard;
  readonly totalCards = this.doseService.totalCards;
  readonly hasNext = this.doseService.hasNext;
  readonly hasPrevious = this.doseService.hasPrevious;
  readonly combo = this.doseService.combo;
  readonly xpEarned = this.doseService.xpEarned;
  readonly completedCount = this.doseService.completedCount;
  readonly isComplete = this.doseService.isComplete;
  readonly progress = this.doseService.progress;

  readonly progressPercent = computed(() => Math.round(this.progress() * 100));

  readonly currentCardIcon = computed(() => {
    const card = this.currentCard();
    return card ? ATOM_TYPE_ICONS[card.atom.atom_type] : '';
  });

  readonly estimatedTime = computed(() => {
    const card = this.currentCard();
    if (!card) return '';
    const mins = Math.ceil(card.estimated_seconds / 60);
    return mins <= 1 ? '~1 min' : `~${mins} min`;
  });

  /** Tracks swipe gesture start position */
  private touchStartX = 0;

  ngOnInit(): void {
    this.doseService.loadDailyDose().subscribe();
  }

  ngOnDestroy(): void {
    this.doseService.resetState();
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }
    switch (event.key) {
      case 'ArrowRight':
      case 'n':
      case 'N':
        this.nextCard();
        break;
      case 'ArrowLeft':
      case 'p':
      case 'P':
        this.previousCard();
        break;
      case 'Enter':
        this.openCurrentAtom();
        break;
      case 'Escape':
        this.exitDose();
        break;
    }
  }

  onTouchStart(event: TouchEvent): void {
    this.touchStartX = event.touches[0].clientX;
  }

  onTouchEnd(event: TouchEvent): void {
    const deltaX = event.changedTouches[0].clientX - this.touchStartX;
    const threshold = 50;
    if (deltaX > threshold) {
      this.previousCard();
    } else if (deltaX < -threshold) {
      this.nextCard();
    }
  }

  nextCard(): void {
    this.doseService.nextCard();
  }

  previousCard(): void {
    this.doseService.previousCard();
  }

  openAtom(atom: LearningAtom): void {
    this.router.navigate(['/learning', 'player', atom.id]);
  }

  openCurrentAtom(): void {
    const card = this.currentCard();
    if (card) {
      this.openAtom(card.atom);
    }
  }

  exitDose(): void {
    this.router.navigate([this.landing.landingRoute()]);
  }

  trackByCardIndex(index: number): number {
    return index;
  }

  getSourceIcon(card: DailyDoseCard): string {
    switch (card.source) {
      case 'ebbinghaus': return 'history';
      case 'curiosity': return 'explore';
      case 'weakness': return 'fitness_center';
    }
  }
}
