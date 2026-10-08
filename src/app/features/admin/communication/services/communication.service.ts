/**
 * CommunicationService — REST adapter for notification preferences,
 * trigger rules, and email templates.
 *
 * Source of truth: chora-contracts/openapi/notifications-admin.yaml
 * All HTTP calls go through BffClientService.
 */
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap, catchError, of } from 'rxjs';
import { BffClientService } from '../../../../core/services/bff-client.service';
import type {
  NotificationPreference,
  PreferenceState,
  TriggerRule,
  TriggerRuleListState,
  EmailTemplate,
  EmailTemplateListState,
} from '../models/communication.model';

const PREFERENCES_PATH = '/api/v1/communication/preferences';
const TRIGGER_RULES_PATH = '/api/v1/communication/trigger-rules';
const EMAIL_TEMPLATES_PATH = '/api/v1/communication/email-templates';

@Injectable({ providedIn: 'root' })
export class CommunicationService {
  private readonly bff = inject(BffClientService);

  // --- State ---
  private readonly _preferenceState = signal<PreferenceState>({ status: 'idle' });
  readonly preferenceState = this._preferenceState.asReadonly();

  private readonly _triggerRuleListState = signal<TriggerRuleListState>({ status: 'idle' });
  readonly triggerRuleListState = this._triggerRuleListState.asReadonly();

  private readonly _emailTemplateListState = signal<EmailTemplateListState>({ status: 'idle' });
  readonly emailTemplateListState = this._emailTemplateListState.asReadonly();

  // ---------------------------------------------------------------------------
  // Preferences
  // ---------------------------------------------------------------------------

  loadPreferences(): Observable<NotificationPreference[] | null> {
    this._preferenceState.set({ status: 'loading' });

    return this.bff.get<NotificationPreference[]>(PREFERENCES_PATH).pipe(
      tap((preferences) => {
        this._preferenceState.set({ status: 'success', preferences });
      }),
      catchError((err: Error) => {
        this._preferenceState.set({
          status: 'error',
          error: { code: 'PREFERENCES_LOAD_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  updatePreference(preference: NotificationPreference): Observable<NotificationPreference | null> {
    return this.bff.put<NotificationPreference>(PREFERENCES_PATH, preference).pipe(
      tap((updated) => {
        const current = this._preferenceState();
        if (current.status === 'success') {
          const updatedPreferences = current.preferences.map((p) =>
            p.event_category === updated.event_category && p.channel === updated.channel
              ? updated
              : p,
          );
          this._preferenceState.set({ status: 'success', preferences: updatedPreferences });
        }
      }),
      catchError(() => of(null)),
    );
  }

  // ---------------------------------------------------------------------------
  // Trigger Rules
  // ---------------------------------------------------------------------------

  loadTriggerRules(): Observable<TriggerRule[] | null> {
    this._triggerRuleListState.set({ status: 'loading' });

    return this.bff.get<TriggerRule[]>(TRIGGER_RULES_PATH).pipe(
      tap((rules) => {
        this._triggerRuleListState.set({ status: 'success', rules });
      }),
      catchError((err: Error) => {
        this._triggerRuleListState.set({
          status: 'error',
          error: { code: 'TRIGGER_RULES_LOAD_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  createTriggerRule(rule: Omit<TriggerRule, 'id' | 'created_at' | 'updated_at'>): Observable<TriggerRule | null> {
    return this.bff.post<TriggerRule>(TRIGGER_RULES_PATH, rule).pipe(
      tap((created) => {
        const current = this._triggerRuleListState();
        if (current.status === 'success') {
          this._triggerRuleListState.set({
            status: 'success',
            rules: [...current.rules, created],
          });
        }
      }),
      catchError(() => of(null)),
    );
  }

  updateTriggerRule(id: string, updates: Partial<TriggerRule>): Observable<TriggerRule | null> {
    return this.bff
      .put<TriggerRule>(`${TRIGGER_RULES_PATH}/${encodeURIComponent(id)}`, updates)
      .pipe(
        tap((updated) => {
          const current = this._triggerRuleListState();
          if (current.status === 'success') {
            const updatedRules = current.rules.map((r) => (r.id === id ? updated : r));
            this._triggerRuleListState.set({ status: 'success', rules: updatedRules });
          }
        }),
        catchError(() => of(null)),
      );
  }

  // ---------------------------------------------------------------------------
  // Email Templates
  // ---------------------------------------------------------------------------

  loadEmailTemplates(): Observable<EmailTemplate[] | null> {
    this._emailTemplateListState.set({ status: 'loading' });

    return this.bff.get<EmailTemplate[]>(EMAIL_TEMPLATES_PATH).pipe(
      tap((templates) => {
        this._emailTemplateListState.set({ status: 'success', templates });
      }),
      catchError((err: Error) => {
        this._emailTemplateListState.set({
          status: 'error',
          error: { code: 'EMAIL_TEMPLATES_LOAD_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  updateEmailTemplate(id: string, updates: Partial<EmailTemplate>): Observable<EmailTemplate | null> {
    return this.bff
      .put<EmailTemplate>(`${EMAIL_TEMPLATES_PATH}/${encodeURIComponent(id)}`, updates)
      .pipe(
        tap((updated) => {
          const current = this._emailTemplateListState();
          if (current.status === 'success') {
            const updatedTemplates = current.templates.map((t) => (t.id === id ? updated : t));
            this._emailTemplateListState.set({ status: 'success', templates: updatedTemplates });
          }
        }),
        catchError(() => of(null)),
      );
  }
}
