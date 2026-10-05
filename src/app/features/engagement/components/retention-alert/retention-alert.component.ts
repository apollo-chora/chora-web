import {
  Component, ChangeDetectionStrategy, inject, OnInit, computed,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { RetentionService } from '../../services/retention.service';
import type { AtRiskAtom } from '../../services/retention.service';

@Component({
  selector: 'chora-retention-alert',
  imports: [TranslatePipe],
  templateUrl: './retention-alert.component.html',
  styleUrl: './retention-alert.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RetentionAlertComponent implements OnInit {
  private readonly retentionService = inject(RetentionService);
  private readonly router = inject(Router);

  readonly state = this.retentionService.retentionState;
  readonly retentionScore = this.retentionService.retentionScore;
  readonly atRiskAtoms = this.retentionService.atRiskAtoms;
  readonly forgettingCurve = this.retentionService.forgettingCurve;

  readonly scoreLevel = computed<'high' | 'medium' | 'low'>(() => {
    const score = this.retentionScore();
    if (score >= 70) return 'high';
    if (score >= 40) return 'medium';
    return 'low';
  });

  readonly gaugeRotation = computed(() => {
    const score = this.retentionScore();
    return `rotate(${(score / 100) * 180}deg)`;
  });

  readonly maxCurveRetention = computed(() => {
    const curve = this.forgettingCurve();
    if (curve.length === 0) return 100;
    return Math.max(...curve.map(p => p.predicted_retention));
  });

  ngOnInit(): void {
    if (this.state().status === 'idle') {
      this.retentionService.loadRetention('me').subscribe();
    }
  }

  openAtom(atomId: string): void {
    this.router.navigate(['/atoms', atomId]);
  }

  barWidth(retention: number): string {
    return `${Math.max(retention, 2)}%`;
  }

  barColor(retention: number): string {
    if (retention >= 70) return 'var(--chora-color-success, #4caf50)';
    if (retention >= 40) return 'var(--chora-color-warning, #ff9800)';
    return 'var(--chora-color-error, #f44336)';
  }

  trackByAtomId(_index: number, atom: AtRiskAtom): string {
    return atom.atom_id;
  }
}
