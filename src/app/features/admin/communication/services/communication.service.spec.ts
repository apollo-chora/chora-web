import { TestBed } from '@angular/core/testing';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { CommunicationService } from './communication.service';

describe('CommunicationService', () => {
  let service: CommunicationService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CommunicationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('loadPreferences', () => {
    it('should set loading then success state', () => {
      const mockPrefs = [{ gcid: 'gcid-1', event_category: 'engagement', channel: 'email', enabled: true }];

      service.loadPreferences().subscribe();
      expect(service.preferenceState().status).toBe('loading');

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/communication/preferences'));
      expect(req.request.method).toBe('GET');
      req.flush(mockPrefs);

      expect(service.preferenceState().status).toBe('success');
    });

    it('should set error state on failure', () => {
      service.loadPreferences().subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/communication/preferences'));
      req.flush('Error', { status: 500, statusText: 'Server Error' });
      expect(service.preferenceState().status).toBe('error');
    });
  });

  describe('updatePreference', () => {
    it('should PUT and update local state', () => {
      // First load
      service.loadPreferences().subscribe();
      httpMock.expectOne(r => r.url.includes('/api/v1/communication/preferences') && r.method === 'GET')
        .flush([{ gcid: 'gcid-1', event_category: 'engagement', channel: 'email', enabled: true }]);

      const updated = { gcid: 'gcid-1', event_category: 'engagement' as const, channel: 'email' as const, enabled: false };
      service.updatePreference(updated).subscribe();

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/communication/preferences') && r.method === 'PUT');
      expect(req.request.body).toEqual(updated);
      req.flush(updated);
    });

    it('should leave non-matching preferences untouched (ternary FALSE arm + && short-circuit)', () => {
      // Load two prefs: same category but different channel, and a different category.
      service.loadPreferences().subscribe();
      httpMock.expectOne(r => r.url.includes('/api/v1/communication/preferences') && r.method === 'GET')
        .flush([
          { gcid: 'gcid-1', event_category: 'engagement', channel: 'email', enabled: true },
          { gcid: 'gcid-1', event_category: 'engagement', channel: 'push', enabled: true },
          { gcid: 'gcid-1', event_category: 'social', channel: 'email', enabled: true },
        ]);

      // Update only the engagement/email pref. The engagement/push (category matches,
      // channel mismatch -> && short-circuit FALSE) and social/email (category mismatch)
      // must be left as-is (ternary FALSE arm returns the original `p`).
      const updated = { gcid: 'gcid-1', event_category: 'engagement' as const, channel: 'email' as const, enabled: false };
      service.updatePreference(updated).subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/communication/preferences') && r.method === 'PUT');
      req.flush(updated);

      const state = service.preferenceState();
      expect(state.status).toBe('success');
      if (state.status === 'success') {
        expect(state.preferences).toEqual([
          updated,
          { gcid: 'gcid-1', event_category: 'engagement', channel: 'push', enabled: true },
          { gcid: 'gcid-1', event_category: 'social', channel: 'email', enabled: true },
        ]);
      }
    });

    it('should NOT touch state when not in success status (if FALSE arm)', () => {
      // No prior load -> state is 'idle', so the `if (current.status === 'success')` guard is FALSE.
      expect(service.preferenceState().status).toBe('idle');

      const updated = { gcid: 'gcid-1', event_category: 'engagement' as const, channel: 'email' as const, enabled: false };
      let emitted: unknown = 'unset';
      service.updatePreference(updated).subscribe((v) => (emitted = v));
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/communication/preferences') && r.method === 'PUT');
      req.flush(updated);

      expect(emitted).toEqual(updated);
      expect(service.preferenceState().status).toBe('idle');
    });

    it('should swallow PUT errors and emit null (catchError arm)', () => {
      const updated = { gcid: 'gcid-1', event_category: 'engagement' as const, channel: 'email' as const, enabled: false };
      let emitted: unknown = 'unset';
      service.updatePreference(updated).subscribe((v) => (emitted = v));
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/communication/preferences') && r.method === 'PUT');
      req.flush('Boom', { status: 500, statusText: 'Server Error' });
      expect(emitted).toBeNull();
    });
  });

  describe('loadTriggerRules', () => {
    it('should set loading then success state', () => {
      const mockRules = [{ id: 'tr-1', name: 'Welcome', event_type: 'registration', channel: 'email', status: 'active' }];

      service.loadTriggerRules().subscribe();
      expect(service.triggerRuleListState().status).toBe('loading');

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/communication/trigger-rules'));
      req.flush(mockRules);

      expect(service.triggerRuleListState().status).toBe('success');
    });

    it('should set error state on failure', () => {
      service.loadTriggerRules().subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/communication/trigger-rules'));
      req.flush('Error', { status: 500, statusText: 'Server Error' });
      expect(service.triggerRuleListState().status).toBe('error');
    });
  });

  describe('createTriggerRule', () => {
    it('should POST and append to existing rules', () => {
      // First load
      service.loadTriggerRules().subscribe();
      httpMock.expectOne(r => r.url.includes('/api/v1/communication/trigger-rules') && r.method === 'GET')
        .flush([{ id: 'tr-1', name: 'Welcome', event_type: 'registration', channel: 'email', status: 'active' }]);

      const newRule = { name: 'Streak Reminder', event_type: 'streak_break', channel: 'push' as const, template_id: null, status: 'active' as const };
      service.createTriggerRule(newRule).subscribe();

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/communication/trigger-rules') && r.method === 'POST');
      req.flush({ id: 'tr-2', ...newRule, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' });
    });

    it('should NOT touch state when not in success status (if FALSE arm)', () => {
      // No prior load -> state is 'idle'.
      expect(service.triggerRuleListState().status).toBe('idle');

      const newRule = { name: 'X', event_type: 'e', channel: 'push' as const, template_id: null, status: 'active' as const };
      let emitted: unknown = 'unset';
      service.createTriggerRule(newRule).subscribe((v) => (emitted = v));
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/communication/trigger-rules') && r.method === 'POST');
      const created = { id: 'tr-9', ...newRule, created_at: 't', updated_at: 't' };
      req.flush(created);

      expect(emitted).toEqual(created);
      expect(service.triggerRuleListState().status).toBe('idle');
    });

    it('should swallow POST errors and emit null (catchError arm)', () => {
      const newRule = { name: 'X', event_type: 'e', channel: 'push' as const, template_id: null, status: 'active' as const };
      let emitted: unknown = 'unset';
      service.createTriggerRule(newRule).subscribe((v) => (emitted = v));
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/communication/trigger-rules') && r.method === 'POST');
      req.flush('Boom', { status: 400, statusText: 'Bad Request' });
      expect(emitted).toBeNull();
    });
  });

  describe('updateTriggerRule', () => {
    it('should PUT and update in local state', () => {
      // First load
      service.loadTriggerRules().subscribe();
      httpMock.expectOne(r => r.url.includes('/api/v1/communication/trigger-rules') && r.method === 'GET')
        .flush([{ id: 'tr-1', name: 'Welcome', event_type: 'registration', channel: 'email', status: 'active' }]);

      service.updateTriggerRule('tr-1', { status: 'disabled' }).subscribe();

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/communication/trigger-rules/tr-1') && r.method === 'PUT');
      req.flush({ id: 'tr-1', name: 'Welcome', event_type: 'registration', channel: 'email', status: 'disabled' });
    });

    it('should leave non-matching rules untouched (ternary FALSE arm)', () => {
      service.loadTriggerRules().subscribe();
      httpMock.expectOne(r => r.url.includes('/api/v1/communication/trigger-rules') && r.method === 'GET')
        .flush([
          { id: 'tr-1', name: 'Welcome', event_type: 'registration', channel: 'email', status: 'active' },
          { id: 'tr-2', name: 'Other', event_type: 'streak', channel: 'push', status: 'active' },
        ]);

      const replacement = { id: 'tr-1', name: 'Welcome', event_type: 'registration', channel: 'email' as const, status: 'disabled' as const, created_at: 't', updated_at: 't' };
      service.updateTriggerRule('tr-1', { status: 'disabled' }).subscribe();
      httpMock.expectOne(r => r.url.includes('/api/v1/communication/trigger-rules/tr-1') && r.method === 'PUT')
        .flush(replacement);

      const state = service.triggerRuleListState();
      expect(state.status).toBe('success');
      if (state.status === 'success') {
        // tr-1 replaced (ternary TRUE), tr-2 untouched (ternary FALSE).
        expect(state.rules[0]).toEqual(replacement);
        expect(state.rules[1].id).toBe('tr-2');
        expect(state.rules[1].status).toBe('active');
      }
    });

    it('should NOT touch state when not in success status (if FALSE arm)', () => {
      expect(service.triggerRuleListState().status).toBe('idle');

      let emitted: unknown = 'unset';
      service.updateTriggerRule('tr-1', { status: 'disabled' }).subscribe((v) => (emitted = v));
      const updated = { id: 'tr-1', name: 'W', event_type: 'r', channel: 'email' as const, status: 'disabled' as const, created_at: 't', updated_at: 't' };
      httpMock.expectOne(r => r.url.includes('/api/v1/communication/trigger-rules/tr-1') && r.method === 'PUT')
        .flush(updated);

      expect(emitted).toEqual(updated);
      expect(service.triggerRuleListState().status).toBe('idle');
    });

    it('should encode the id in the URL', () => {
      service.updateTriggerRule('tr/with space', { status: 'disabled' }).subscribe();
      const req = httpMock.expectOne(r => r.method === 'PUT' && r.url.includes('/api/v1/communication/trigger-rules/'));
      expect(req.request.url).toContain('tr%2Fwith%20space');
      req.flush({ id: 'tr/with space', name: 'W', event_type: 'r', channel: 'email', status: 'disabled', created_at: 't', updated_at: 't' });
    });

    it('should swallow PUT errors and emit null (catchError arm)', () => {
      let emitted: unknown = 'unset';
      service.updateTriggerRule('tr-1', { status: 'disabled' }).subscribe((v) => (emitted = v));
      httpMock.expectOne(r => r.url.includes('/api/v1/communication/trigger-rules/tr-1') && r.method === 'PUT')
        .flush('Boom', { status: 500, statusText: 'Server Error' });
      expect(emitted).toBeNull();
    });
  });

  describe('loadEmailTemplates', () => {
    it('should set loading then success state', () => {
      const mockTemplates = [{ id: 'et-1', name: 'Welcome Email', subject: 'Welcome!', body_html: '<p>Hello</p>', variables: [] }];

      service.loadEmailTemplates().subscribe();
      expect(service.emailTemplateListState().status).toBe('loading');

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/communication/email-templates'));
      req.flush(mockTemplates);

      expect(service.emailTemplateListState().status).toBe('success');
    });

    it('should set error state on failure', () => {
      service.loadEmailTemplates().subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/communication/email-templates'));
      req.flush('Error', { status: 500, statusText: 'Server Error' });
      expect(service.emailTemplateListState().status).toBe('error');
    });
  });

  describe('updateEmailTemplate', () => {
    it('should PUT and update in local state', () => {
      // First load
      service.loadEmailTemplates().subscribe();
      httpMock.expectOne(r => r.url.includes('/api/v1/communication/email-templates') && r.method === 'GET')
        .flush([{ id: 'et-1', name: 'Welcome', subject: 'Welcome!', body_html: '<p>Hello</p>', variables: [] }]);

      service.updateEmailTemplate('et-1', { subject: 'Updated Welcome!' }).subscribe();

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/communication/email-templates/et-1') && r.method === 'PUT');
      req.flush({ id: 'et-1', name: 'Welcome', subject: 'Updated Welcome!', body_html: '<p>Hello</p>', variables: [] });
    });

    it('should leave non-matching templates untouched (ternary FALSE arm)', () => {
      service.loadEmailTemplates().subscribe();
      httpMock.expectOne(r => r.url.includes('/api/v1/communication/email-templates') && r.method === 'GET')
        .flush([
          { id: 'et-1', name: 'Welcome', subject: 'Welcome!', body_html: '<p>Hi</p>', variables: [] },
          { id: 'et-2', name: 'Bye', subject: 'Bye!', body_html: '<p>Bye</p>', variables: [] },
        ]);

      const replacement = { id: 'et-1', name: 'Welcome', subject: 'Updated!', body_html: '<p>Hi</p>', variables: [], created_at: 't', updated_at: 't' };
      service.updateEmailTemplate('et-1', { subject: 'Updated!' }).subscribe();
      httpMock.expectOne(r => r.url.includes('/api/v1/communication/email-templates/et-1') && r.method === 'PUT')
        .flush(replacement);

      const state = service.emailTemplateListState();
      expect(state.status).toBe('success');
      if (state.status === 'success') {
        expect(state.templates[0]).toEqual(replacement);
        expect(state.templates[1].id).toBe('et-2');
        expect(state.templates[1].subject).toBe('Bye!');
      }
    });

    it('should NOT touch state when not in success status (if FALSE arm)', () => {
      expect(service.emailTemplateListState().status).toBe('idle');

      let emitted: unknown = 'unset';
      service.updateEmailTemplate('et-1', { subject: 'X' }).subscribe((v) => (emitted = v));
      const updated = { id: 'et-1', name: 'W', subject: 'X', body_html: '<p>h</p>', variables: [], created_at: 't', updated_at: 't' };
      httpMock.expectOne(r => r.url.includes('/api/v1/communication/email-templates/et-1') && r.method === 'PUT')
        .flush(updated);

      expect(emitted).toEqual(updated);
      expect(service.emailTemplateListState().status).toBe('idle');
    });

    it('should swallow PUT errors and emit null (catchError arm)', () => {
      let emitted: unknown = 'unset';
      service.updateEmailTemplate('et-1', { subject: 'X' }).subscribe((v) => (emitted = v));
      httpMock.expectOne(r => r.url.includes('/api/v1/communication/email-templates/et-1') && r.method === 'PUT')
        .flush('Boom', { status: 500, statusText: 'Server Error' });
      expect(emitted).toBeNull();
    });
  });
});
