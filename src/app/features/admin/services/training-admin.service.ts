/**
 * TrainingAdminService — REST adapter for training session management.
 *
 * Source of truth: chora-training-admin/internal/adapters/http/routes.go
 * All HTTP calls go through BffClientService.
 */
import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, tap, catchError, of } from 'rxjs';
import { BffClientService } from '../../../core/services/bff-client.service';

// ---------------------------------------------------------------------------
// Domain Models
// ---------------------------------------------------------------------------

export type SessionStatus = 'draft' | 'scheduled' | 'live' | 'completed' | 'cancelled';

export type ComplianceStatus = 'green' | 'amber' | 'red';

export interface TrainingAgendaItem {
  atom_id: string;
  atom_title: string;
  atom_type: string;
  order: number;
  delivery_notes: string;
  duration_minutes: number;
}

export interface TrainingSession {
  id: string;
  tenant_id: string;
  title: string;
  description: string;
  status: SessionStatus;
  scheduled_at: string;
  duration_minutes: number;
  agenda: TrainingAgendaItem[];
  trainer_gcid: string;
  max_participants: number;
  venue_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateSessionRequest {
  title: string;
  description: string;
  scheduled_at: string;
  duration_minutes: number;
  agenda: Omit<TrainingAgendaItem, 'atom_title' | 'atom_type'>[];
  max_participants: number;
  venue_id?: string;
}

export interface LiveSessionData {
  session: TrainingSession;
  attendance_count: number;
  total_expected: number;
  current_agenda_index: number;
  engagement_score: number;
  late_arrivals: number;
}

export interface AttendanceRecord {
  gcid: string;
  display_name: string;
  checked_in_at: string | null;
  is_late: boolean;
  is_manual_override: boolean;
}

export interface ComplianceDepartment {
  department_id: string;
  department_name: string;
  status: ComplianceStatus;
  completed_count: number;
  required_count: number;
  completion_pct: number;
  deadline: string;
  days_remaining: number;
  overdue_learners: number;
}

export interface ComplianceDashboardData {
  departments: ComplianceDepartment[];
  overall_completion_pct: number;
  total_overdue: number;
  next_deadline: string;
}

export interface AtomSearchResult {
  id: string;
  title: string;
  type: string;
  topic_name: string;
  difficulty: number;
}

// ---------------------------------------------------------------------------
// Discriminated Union States
// ---------------------------------------------------------------------------

export type SessionState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; session: TrainingSession }
  | { status: 'error'; error: { code: string; message: string } };

export type LiveSessionState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: LiveSessionData }
  | { status: 'error'; error: { code: string; message: string } };

export type ComplianceState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: ComplianceDashboardData }
  | { status: 'error'; error: { code: string; message: string } };

export type AtomSearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; results: AtomSearchResult[] }
  | { status: 'error'; error: { code: string; message: string } };

// ---------------------------------------------------------------------------
// Endpoint paths
// ---------------------------------------------------------------------------

const TRAINING_PATH = '/api/v1/training-admin';
const ATOMS_SEARCH_PATH = '/api/v1/atomic/atoms/search';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable({ providedIn: 'root' })
export class TrainingAdminService {
  private readonly bff = inject(BffClientService);

  // --- Session state ---
  private readonly _sessionState = signal<SessionState>({ status: 'idle' });
  readonly sessionState = this._sessionState.asReadonly();

  private readonly _liveSessionState = signal<LiveSessionState>({ status: 'idle' });
  readonly liveSessionState = this._liveSessionState.asReadonly();

  private readonly _complianceState = signal<ComplianceState>({ status: 'idle' });
  readonly complianceState = this._complianceState.asReadonly();

  private readonly _atomSearchState = signal<AtomSearchState>({ status: 'idle' });
  readonly atomSearchState = this._atomSearchState.asReadonly();

  // --- Computed ---
  readonly currentSession = computed(() => {
    const s = this._sessionState();
    return s.status === 'success' ? s.session : null;
  });

  readonly liveData = computed(() => {
    const s = this._liveSessionState();
    return s.status === 'success' ? s.data : null;
  });

  readonly complianceData = computed(() => {
    const s = this._complianceState();
    return s.status === 'success' ? s.data : null;
  });

  readonly atomResults = computed(() => {
    const s = this._atomSearchState();
    return s.status === 'success' ? s.results : [];
  });

  // ---------------------------------------------------------------------------
  // Session CRUD
  // ---------------------------------------------------------------------------

  createSession(data: CreateSessionRequest): Observable<TrainingSession | null> {
    this._sessionState.set({ status: 'loading' });
    return this.bff
      .post<TrainingSession>(`${TRAINING_PATH}/sessions`, data)
      .pipe(
        tap((session) =>
          this._sessionState.set({ status: 'success', session }),
        ),
        catchError((err: Error) => {
          this._sessionState.set({
            status: 'error',
            error: { code: 'SESSION_CREATE_FAILED', message: err.message },
          });
          return of(null);
        }),
      );
  }

  getSession(sessionId: string): Observable<TrainingSession | null> {
    this._sessionState.set({ status: 'loading' });
    return this.bff
      .get<TrainingSession>(
        `${TRAINING_PATH}/sessions/${encodeURIComponent(sessionId)}`,
      )
      .pipe(
        tap((session) =>
          this._sessionState.set({ status: 'success', session }),
        ),
        catchError((err: Error) => {
          this._sessionState.set({
            status: 'error',
            error: { code: 'SESSION_GET_FAILED', message: err.message },
          });
          return of(null);
        }),
      );
  }

  // ---------------------------------------------------------------------------
  // Live session
  // ---------------------------------------------------------------------------

  getLiveSession(sessionId: string): Observable<LiveSessionData | null> {
    this._liveSessionState.set({ status: 'loading' });
    return this.bff
      .get<LiveSessionData>(
        `${TRAINING_PATH}/sessions/${encodeURIComponent(sessionId)}/live`,
      )
      .pipe(
        tap((data) =>
          this._liveSessionState.set({ status: 'success', data }),
        ),
        catchError((err: Error) => {
          this._liveSessionState.set({
            status: 'error',
            error: { code: 'LIVE_SESSION_FAILED', message: err.message },
          });
          return of(null);
        }),
      );
  }

  advanceAgenda(sessionId: string): Observable<LiveSessionData | null> {
    return this.bff
      .post<LiveSessionData>(
        `${TRAINING_PATH}/sessions/${encodeURIComponent(sessionId)}/advance`,
        {},
      )
      .pipe(
        tap((data) =>
          this._liveSessionState.set({ status: 'success', data }),
        ),
        catchError(() => of(null)),
      );
  }

  getAttendance(sessionId: string): Observable<AttendanceRecord[]> {
    return this.bff
      .get<{ data: AttendanceRecord[] }>(
        `${TRAINING_PATH}/sessions/${encodeURIComponent(sessionId)}/attendance`,
      )
      .pipe(
        tap((res) => res),
        catchError(() => of({ data: [] })),
      )
      .pipe(tap((res) => res.data)) as unknown as Observable<AttendanceRecord[]>;
  }

  overrideAttendance(
    sessionId: string,
    gcid: string,
  ): Observable<boolean> {
    return this.bff
      .post<unknown>(
        `${TRAINING_PATH}/sessions/${encodeURIComponent(sessionId)}/attendance/override`,
        { gcid },
      )
      .pipe(
        tap(() => true),
        catchError(() => of(false)),
      ) as unknown as Observable<boolean>;
  }

  // ---------------------------------------------------------------------------
  // Compliance
  // ---------------------------------------------------------------------------

  loadCompliance(): Observable<ComplianceDashboardData | null> {
    this._complianceState.set({ status: 'loading' });
    return this.bff
      .get<ComplianceDashboardData>(`${TRAINING_PATH}/compliance`)
      .pipe(
        tap((data) =>
          this._complianceState.set({ status: 'success', data }),
        ),
        catchError((err: Error) => {
          this._complianceState.set({
            status: 'error',
            error: { code: 'COMPLIANCE_LOAD_FAILED', message: err.message },
          });
          return of(null);
        }),
      );
  }

  scheduleRemediation(departmentId: string): Observable<boolean> {
    return this.bff
      .post<unknown>(
        `${TRAINING_PATH}/compliance/${encodeURIComponent(departmentId)}/remediate`,
        {},
      )
      .pipe(
        tap(() => true),
        catchError(() => of(false)),
      ) as unknown as Observable<boolean>;
  }

  // ---------------------------------------------------------------------------
  // Atom search (for session building)
  // ---------------------------------------------------------------------------

  searchAtoms(query: string): Observable<AtomSearchResult[]> {
    this._atomSearchState.set({ status: 'loading' });
    return this.bff
      .get<{ data: AtomSearchResult[] }>(
        `${ATOMS_SEARCH_PATH}?q=${encodeURIComponent(query)}`,
      )
      .pipe(
        tap((res) =>
          this._atomSearchState.set({
            status: 'success',
            results: res.data ?? [],
          }),
        ),
        catchError((err: Error) => {
          this._atomSearchState.set({
            status: 'error',
            error: { code: 'ATOM_SEARCH_FAILED', message: err.message },
          });
          return of({ data: [] });
        }),
      ) as unknown as Observable<AtomSearchResult[]>;
  }

  // ---------------------------------------------------------------------------
  // State reset
  // ---------------------------------------------------------------------------

  resetState(): void {
    this._sessionState.set({ status: 'idle' });
    this._liveSessionState.set({ status: 'idle' });
    this._complianceState.set({ status: 'idle' });
    this._atomSearchState.set({ status: 'idle' });
  }
}
