/**
 * WeaknessDrillLauncherComponent — Displays struggling topics based on TopicRetention
 * data and launches a drill session with 8-12 atoms at reduced difficulty.
 *
 * Route: /engagement/drill/:topicId
 */
import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { Subscription } from 'rxjs';
import { BffClientService } from '../../../../core/services/bff-client.service';
import { tap, catchError, of } from 'rxjs';

// ---------------------------------------------------------------------------
// Domain Models
// ---------------------------------------------------------------------------

interface WeakAtom {
  atom_id: string;
  atom_title: string;
  atom_type: string;
  retention_pct: number;
  last_reviewed_at: string | null;
  difficulty: number;
}

interface DrillTopic {
  topic_id: string;
  topic_name: string;
  retention_pct: number;
  weak_atom_count: number;
  weak_atoms: WeakAtom[];
}

interface DrillSession {
  session_id: string;
  topic_id: string;
  atom_count: number;
  difficulty_modifier: number;
  redirect_url: string;
}

type DrillState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; topic: DrillTopic }
  | { status: 'error'; error: { code: string; message: string } };

type LaunchState =
  | { status: 'idle' }
  | { status: 'launching' }
  | { status: 'success'; session: DrillSession }
  | { status: 'error'; error: { code: string; message: string } };

// ---------------------------------------------------------------------------
// Endpoint paths
// ---------------------------------------------------------------------------

const DRILL_PATH = '/api/v1/engagement/drills';

@Component({
  selector: 'chora-weakness-drill-launcher',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './weakness-drill-launcher.component.html',
  styleUrl: './weakness-drill-launcher.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WeaknessDrillLauncherComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly bff = inject(BffClientService);

  readonly drillState = signal<DrillState>({ status: 'idle' });
  readonly launchState = signal<LaunchState>({ status: 'idle' });

  readonly topic = computed(() => {
    const s = this.drillState();
    return s.status === 'success' ? s.topic : null;
  });

  readonly weakAtoms = computed(() => this.topic()?.weak_atoms ?? []);
  readonly atomCount = computed(() => this.weakAtoms().length);

  readonly isLaunching = computed(
    () => this.launchState().status === 'launching',
  );

  readonly drillError = computed(() => {
    const s = this.drillState();
    return s.status === 'error' ? s.error.message : '';
  });

  private subscriptions = new Subscription();
  private topicId = '';

  ngOnInit(): void {
    this.topicId = this.route.snapshot.paramMap.get('topicId') ?? '';
    if (!this.topicId) return;

    this.loadDrillTopic();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  launchDrill(): void {
    if (!this.topicId || this.isLaunching()) return;

    this.launchState.set({ status: 'launching' });

    this.subscriptions.add(
      this.bff
        .post<DrillSession>(`${DRILL_PATH}/${encodeURIComponent(this.topicId)}/start`, {})
        .pipe(
          tap((session) => {
            this.launchState.set({ status: 'success', session });
            void this.router.navigate([session.redirect_url]);
          }),
          catchError((err: Error) => {
            this.launchState.set({
              status: 'error',
              error: { code: 'DRILL_LAUNCH_FAILED', message: err.message },
            });
            return of(null);
          }),
        )
        .subscribe(),
    );
  }

  retentionClass(pct: number): string {
    if (pct < 30) return 'weakness-drill-launcher__retention--critical';
    if (pct < 60) return 'weakness-drill-launcher__retention--low';
    return 'weakness-drill-launcher__retention--moderate';
  }

  private loadDrillTopic(): void {
    this.drillState.set({ status: 'loading' });

    this.subscriptions.add(
      this.bff
        .get<DrillTopic>(`${DRILL_PATH}/${encodeURIComponent(this.topicId)}`)
        .pipe(
          tap((topic) => this.drillState.set({ status: 'success', topic })),
          catchError((err: Error) => {
            this.drillState.set({
              status: 'error',
              error: { code: 'DRILL_LOAD_FAILED', message: err.message },
            });
            return of(null);
          }),
        )
        .subscribe(),
    );
  }
}
