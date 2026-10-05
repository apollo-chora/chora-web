import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, map, tap, catchError, of } from 'rxjs';
import { BffClientService } from '../../../core/services/bff-client.service';
import {
  DailyDoseCard,
  DailyDoseSession,
  DailyDoseState,
  ComboTier,
  LearningAtom,
} from '../models/atom.models';

// ---------------------------------------------------------------------------
// BFF Response Mapper
// ---------------------------------------------------------------------------

interface DailyDoseResponse {
  cards: {
    atom: Record<string, unknown>;
    topic_label: string;
    estimated_seconds: number;
    is_goal_aligned: boolean;
    source: 'ebbinghaus' | 'curiosity' | 'weakness';
  }[];
}

function mapCardFromResponse(raw: DailyDoseResponse['cards'][number]): DailyDoseCard {
  return {
    atom: raw.atom as unknown as LearningAtom,
    topic_label: raw.topic_label,
    estimated_seconds: raw.estimated_seconds,
    is_goal_aligned: raw.is_goal_aligned,
    source: raw.source,
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MAX_COMBO_TIER: ComboTier = 4;
export const COMBO_TIERS: ComboTier[] = [1, 2, 3, 4];

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable({ providedIn: 'root' })
export class DailyDoseService {
  private readonly bff = inject(BffClientService);
  // M14.iter5.B — fixed path mismatch: the BFF route is /api/familiar/daily-dose
  // (registered by phyllis_handler.go and fanned out to
  // chora-consumption:/familiar/daily-dose). The prior /api/v1/engagement/...
  // path was a wave-2 placeholder that never landed in the BFF.
  private readonly dailyDosePath = '/api/familiar/daily-dose';

  // --- State signals ---
  private readonly _doseState = signal<DailyDoseState>({ status: 'idle' });
  readonly doseState = this._doseState.asReadonly();

  private readonly _currentIndex = signal(0);
  readonly currentIndex = this._currentIndex.asReadonly();

  private readonly _combo = signal<ComboTier>(1);
  readonly combo = this._combo.asReadonly();

  private readonly _xpEarned = signal(0);
  readonly xpEarned = this._xpEarned.asReadonly();

  private readonly _completedCount = signal(0);
  readonly completedCount = this._completedCount.asReadonly();

  // --- Computed ---
  readonly cards = computed(() => {
    const s = this._doseState();
    return s.status === 'success' ? s.session.cards : [];
  });

  readonly totalCards = computed(() => this.cards().length);

  readonly currentCard = computed(() => {
    const c = this.cards();
    const i = this._currentIndex();
    return i >= 0 && i < c.length ? c[i] : null;
  });

  readonly hasNext = computed(() => this._currentIndex() < this.totalCards() - 1);
  readonly hasPrevious = computed(() => this._currentIndex() > 0);

  readonly isComplete = computed(() =>
    this._completedCount() >= this.totalCards() && this.totalCards() > 0
  );

  readonly progress = computed(() => {
    const total = this.totalCards();
    return total > 0 ? this._completedCount() / total : 0;
  });

  // ---------------------------------------------------------------------------
  // Load daily dose
  // ---------------------------------------------------------------------------

  loadDailyDose(): Observable<DailyDoseSession | null> {
    this._doseState.set({ status: 'loading' });
    this._currentIndex.set(0);
    this._combo.set(1);
    this._xpEarned.set(0);
    this._completedCount.set(0);

    return this.bff.get<DailyDoseResponse>(this.dailyDosePath).pipe(
      map((res) => {
        const cards = res.cards.map(mapCardFromResponse);
        const session: DailyDoseSession = {
          cards,
          combo: 1,
          xp_earned: 0,
          completed_count: 0,
        };
        return session;
      }),
      tap((session) => {
        this._doseState.set({ status: 'success', session });
      }),
      catchError((err: Error) => {
        this._doseState.set({
          status: 'error',
          error: { code: 'DAILY_DOSE_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  nextCard(): void {
    if (this.hasNext()) {
      this._currentIndex.update((i) => i + 1);
    }
  }

  previousCard(): void {
    if (this.hasPrevious()) {
      this._currentIndex.update((i) => i - 1);
    }
  }

  goToCard(index: number): void {
    const total = this.totalCards();
    if (index >= 0 && index < total) {
      this._currentIndex.set(index);
    }
  }

  // ---------------------------------------------------------------------------
  // Combo + XP
  // ---------------------------------------------------------------------------

  recordCorrect(baseXp: number): void {
    const newCombo = Math.min(this._combo() + 1, MAX_COMBO_TIER) as ComboTier;
    this._combo.set(newCombo);
    this._xpEarned.update((xp) => xp + baseXp * this._combo());
    this._completedCount.update((c) => c + 1);
  }

  recordIncorrect(): void {
    this._combo.set(1);
    this._completedCount.update((c) => c + 1);
  }

  // ---------------------------------------------------------------------------
  // State reset
  // ---------------------------------------------------------------------------

  resetState(): void {
    this._doseState.set({ status: 'idle' });
    this._currentIndex.set(0);
    this._combo.set(1);
    this._xpEarned.set(0);
    this._completedCount.set(0);
  }
}
