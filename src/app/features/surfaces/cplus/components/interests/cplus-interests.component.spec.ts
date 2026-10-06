// describe/it/beforeEach/afterEach come from the GLOBAL Vitest API
// (globals:true) so AnalogJS setup-zone wraps each test body in a
// ProxyZone — required by Angular fakeAsync()/tick(). An explicit
// 'vitest' import would use unpatched bindings -> "Expected to be
// running in 'ProxyZone'".
import { expect, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TranslateService } from '../../../../../core/services/translate.service';

import { CplusInterestsComponent } from './cplus-interests.component';
import { AuthService } from '../../../../../core/auth/auth.service';

interface TagLike {
  category: string;
  tag: string;
}

interface ProfileLike {
  gcid: string;
  bio?: string;
  tags?: TagLike[] | null;
}

/**
 * In-process WebSocket stub. connectProfileWS builds `new WebSocket(url)`
 * via the browser API; we patch the global constructor so the component
 * gets a fake whose message/close callbacks we can drive from the test.
 * `throwOnConstruct` simulates the browser rejecting a malformed URL
 * (the constructor-throw path that arms the poll fallback).
 */
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static lastUrl = '';
  static throwOnConstruct = false;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = 1;
  closed = false;
  url: string;

  constructor(url: string) {
    if (FakeWebSocket.throwOnConstruct) {
      throw new DOMException('WebSocket blocked by the test', 'SecurityError');
    }
    this.url = url;
    FakeWebSocket.instances.push(this as unknown as FakeWebSocket);
    FakeWebSocket.lastUrl = url;
  }

  send(_data: string): void { /* noop */ }

  close(): void {
    this.closed = true;
    this.readyState = 3;
  }
}

/** Wire-shape of the `profile_ready` / `profile_error` frame envelope. */
function wsFrame(kind: string, payload: unknown): string {
  return JSON.stringify({ kind, payload });
}

const PROFILE_WITH_TAGS: ProfileLike = {
  gcid: 'gcid-alice-0001',
  bio: 'I build distributed systems',
  tags: [
    { category: 'programming', tag: 'golang' },
    { category: 'programming', tag: 'rust' },
  ],
};

describe('CplusInterestsComponent', () => {
  let fixture: ComponentFixture<CplusInterestsComponent>;
  let component: CplusInterestsComponent;
  let element: HTMLElement;
  let httpMock: HttpTestingController;
  let auth: AuthService;
  let originalWebSocket: typeof WebSocket;

  beforeEach(async () => {
    FakeWebSocket.instances = [];
    FakeWebSocket.throwOnConstruct = false;
    originalWebSocket = globalThis.WebSocket;
    (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket =
      FakeWebSocket as unknown as typeof WebSocket;

    await TestBed.configureTestingModule({
      imports: [CplusInterestsComponent],
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        TranslateService,
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(CplusInterestsComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement;
    httpMock = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  });

  afterEach(() => {
    (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = originalWebSocket;
    httpMock.verify();
  });

  /** Seed the auth session JWT (used for the WebSocket access_token param). */
  function stubToken(token: string | null): void {
    (auth as unknown as { getToken: () => string | null }).getToken = () => token;
  }

  /** Drive ngOnInit: flush the profile + courses GETs and settle CD. */
  async function flushInit(
    profile: ProfileLike | null = PROFILE_WITH_TAGS,
    courses: string[] = [],
  ): Promise<void> {
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url.endsWith('/v1/me/profile')).flush(profile as never);
    httpMock.expectOne((r) => r.url.endsWith('/api/v1/me/courses')).flush({
      courses: courses.map((title) => ({ title })),
    });
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function pollTimer(): ReturnType<typeof setTimeout> | null {
    return (component as unknown as {
      pollFallbackTimer: ReturnType<typeof setTimeout> | null;
    }).pollFallbackTimer;
  }

  /** Start a generation (POST flushed with the 202 wrapped profile) + grab the fake WS. */
  async function startGenerating(
    profile: ProfileLike = { gcid: 'g', bio: 'b', tags: [] },
  ): Promise<FakeWebSocket> {
    stubToken('jwt-session');
    const p = component.generateProfile();
    const req = httpMock.expectOne((r) => r.url.endsWith('/v1/me/profile/generate'));
    req.flush({ status: 'generating', profile });
    await p;
    fixture.detectChanges();
    return FakeWebSocket.instances[0];
  }

  it('creates', async () => {
    await flushInit();
    expect(component).toBeTruthy();
  });

  it('applies the loaded profile to bio + editing tags on init', async () => {
    await flushInit();
    expect(component.profileState().status).toBe('success');
    expect(component.hasProfile()).toBe(true);
    expect(component.bio()).toBe('I build distributed systems');
    expect(component.editingTags()).toEqual(PROFILE_WITH_TAGS.tags);
    expect(component.isDirty()).toBe(false);
    // Picker defaults to the first selected tag's category.
    expect(component.activePickerCategory()).toBe('programming');
  });

  it('loads completed course titles into a signal', async () => {
    await flushInit(PROFILE_WITH_TAGS, ['Math 101', 'CS 101']);
    expect(component.completedCourses()).toEqual(['Math 101', 'CS 101']);
  });

  it('keeps the profile idle when the GET returns null', async () => {
    await flushInit(null);
    expect(component.profileState().status).toBe('idle');
    expect(component.hasProfile()).toBe(false);
  });

  it('falls back to idle when the profile GET fails', async () => {
    fixture.detectChanges();
    httpMock
      .expectOne((r) => r.url.endsWith('/v1/me/profile'))
      .flush({}, { status: 500, statusText: 'Server Error' });
    httpMock.expectOne((r) => r.url.endsWith('/api/v1/me/courses')).flush({ courses: [] });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.profileState().status).toBe('idle');
    expect(component.hasProfile()).toBe(false);
  });

  it('ignores a courses load failure (courses are optional)', async () => {
    fixture.detectChanges();
    httpMock
      .expectOne((r) => r.url.endsWith('/v1/me/profile'))
      .flush({ gcid: 'g', bio: 'b', tags: [] });
    httpMock
      .expectOne((r) => r.url.endsWith('/api/v1/me/courses'))
      .flush({}, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    expect(component.completedCourses()).toEqual([]);
    expect(component.profileState().status).toBe('success');
  });

  it('toggleTag adds a tag and marks the selection dirty', async () => {
    await flushInit();
    expect(component.isDirty()).toBe(false);
    component.toggleTag('programming', 'system_design');
    expect(component.isSelected('programming', 'system_design')).toBe(true);
    expect(component.editingTags().some((t) => t.tag === 'system_design')).toBe(true);
    expect(component.isDirty()).toBe(true);
    expect(component.tagCount()).toBe(3);
    expect(component.hasAnyTags()).toBe(true);
  });

  it('toggleTag on an already-selected tag removes it again', async () => {
    await flushInit();
    component.toggleTag('programming', 'golang');
    expect(component.isSelected('programming', 'golang')).toBe(false);
    expect(component.editingTags().some((t) => t.tag === 'golang')).toBe(false);
    // The snapshot still holds golang → the draft is no longer clean.
    expect(component.isDirty()).toBe(true);
  });

  it('addCustomTag slugifies the input and adds it to the active category', async () => {
    await flushInit();
    component.newTagInput.set('  Go Lang!  ');
    component.addCustomTag();
    expect(component.editingTags()[component.editingTags().length - 1]).toEqual({
      category: 'programming',
      tag: 'go_lang',
    });
    expect(component.newTagInput()).toBe('');
    expect(component.saveState().status).toBe('idle');
    expect(component.isDirty()).toBe(true);
  });

  it('addCustomTag is a no-op for whitespace-only input', async () => {
    await flushInit();
    component.newTagInput.set('   ');
    const before = component.editingTags().length;
    component.addCustomTag();
    expect(component.editingTags().length).toBe(before);
  });

  it('addCustomTag is a no-op when slugification empties the input', async () => {
    await flushInit();
    component.newTagInput.set('!!!');
    const before = component.editingTags().length;
    component.addCustomTag();
    expect(component.editingTags().length).toBe(before);
  });

  it('addCustomTag silently ignores a duplicate of an existing tag', async () => {
    await flushInit();
    component.newTagInput.set('Golang');
    component.addCustomTag();
    expect(component.editingTags()).toHaveLength(2);
    expect(component.newTagInput()).toBe('');
  });

  it('uses the active picker category for custom tags', async () => {
    await flushInit();
    component.selectPickerCategory('arts');
    component.newTagInput.set('painting');
    component.addCustomTag();
    expect(component.editingTags()[component.editingTags().length - 1]).toEqual({
      category: 'arts',
      tag: 'painting',
    });
    expect(component.activePickerCategory()).toBe('arts');
  });

  it('humanizes category + tag labels', async () => {
    await flushInit();
    expect(component.labelForCategory('mathematics')).toBe('Mathematics');
    expect(component.labelForCategory('machine_learning')).toBe('Machine Learning');
    expect(component.labelForTag('deep_learning')).toBe('Deep Learning');
  });

  it('removeTag filters the tag out', async () => {
    await flushInit();
    component.removeTag('programming', 'golang');
    expect(component.editingTags().some((t) => t.tag === 'golang')).toBe(false);
    expect(component.isDirty()).toBe(true);
    expect(component.isSelected('programming', 'golang')).toBe(false);
  });

  it('groups + sorts selected tags by taxonomy order, unknown categories last', async () => {
    await flushInit({
      gcid: 'g',
      bio: 'b',
      tags: [
        { category: 'machine_learning', tag: 'cnn' },
        { category: 'programming', tag: 'zig' },
        { category: 'programming', tag: 'go' },
      ],
    });
    const groups = component.groupedTags();
    expect(groups).toHaveLength(2);
    expect(groups[0].key).toBe('programming');
    expect(groups[0].label).toBe('Programming');
    expect(groups[0].tags.map((t) => t.tag)).toEqual(['go', 'zig']);
    expect(groups[1].key).toBe('machine_learning');
    expect(groups[1].label).toBe('Machine Learning');
    expect(groups[1].tags).toEqual([{ category: 'machine_learning', tag: 'cnn' }]);
  });

  it('falls back to the first taxonomy category when a profile has no tags', async () => {
    await flushInit({ gcid: 'g', bio: '', tags: [] });
    expect(component.hasAnyTags()).toBe(false);
    expect(component.activePickerCategory()).toBe('programming');
  });

  it('generateProfile POSTs bio + course titles and applies the 202-wrapped profile', async () => {
    await flushInit(PROFILE_WITH_TAGS, ['Math 101']);
    stubToken('jwt-session');
    const generated: ProfileLike = {
      gcid: 'gcid-alice-0001',
      bio: 'new bio',
      tags: [{ category: 'mathematics', tag: 'algebra' }],
    };
    const p = component.generateProfile();
    const req = httpMock.expectOne((r) => r.url.endsWith('/v1/me/profile/generate'));
    expect(req.request.body).toEqual({
      bio: 'I build distributed systems',
      course_titles: ['Math 101'],
    });
    req.flush({ status: 'generating', profile: generated });
    await p;
    fixture.detectChanges();
    expect(component.generateState().status).toBe('generating');
    expect(component.editingTags()).toEqual(generated.tags);
    // The WS is opened with the session JWT as the access_token param.
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.lastUrl).toContain('/v1/me/profile/ws?access_token=jwt-session');
  });

  it('generateProfile accepts a bare Profile response (sync path)', async () => {
    await flushInit();
    stubToken('jwt-session');
    const p = component.generateProfile();
    const req = httpMock.expectOne((r) => r.url.endsWith('/v1/me/profile/generate'));
    req.flush({ gcid: 'g', bio: 'sync', tags: [{ category: 'programming', tag: 'go' }] });
    await p;
    expect(component.editingTags()).toEqual([{ category: 'programming', tag: 'go' }]);
    // The WS is still opened to receive the completion frame.
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('builds the WS URL without access_token when unauthenticated', async () => {
    await flushInit();
    stubToken(null);
    const p = component.generateProfile();
    const req = httpMock.expectOne((r) => r.url.endsWith('/v1/me/profile/generate'));
    req.flush({ status: 'generating', profile: { gcid: 'g', bio: 'b', tags: [] } });
    await p;
    expect(FakeWebSocket.lastUrl).toContain('/v1/me/profile/ws');
    expect(FakeWebSocket.lastUrl).not.toContain('access_token');
  });

  it('maps an upstream generate failure to an error state without opening a WS', async () => {
    await flushInit();
    const p = component.generateProfile();
    const req = httpMock.expectOne((r) => r.url.endsWith('/v1/me/profile/generate'));
    req.flush({}, { status: 500, statusText: 'Server Error' });
    await p;
    expect(component.generateState()).toEqual({
      status: 'error',
      message: 'cplus.interests.error_upstream',
    });
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it('maps a 401 generate failure to the not-authenticated key', async () => {
    await flushInit();
    const p = component.generateProfile();
    const req = httpMock.expectOne((r) => r.url.endsWith('/v1/me/profile/generate'));
    req.flush({}, { status: 401, statusText: 'Unauthorized' });
    await p;
    expect(component.generateState()).toEqual({
      status: 'error',
      message: 'cplus.interests.error_unauthenticated',
    });
  });

  // 403 had no coverage at all before the split: the conflated branch meant
  // a refused user was told their session had expired, and no spec noticed.
  it('maps a 403 generate failure to the forbidden key', async () => {
    await flushInit();
    const p = component.generateProfile();
    const req = httpMock.expectOne((r) => r.url.endsWith('/v1/me/profile/generate'));
    req.flush({}, { status: 403, statusText: 'Forbidden' });
    await p;
    expect(component.generateState()).toEqual({
      status: 'error',
      message: 'cplus.interests.error_forbidden',
    });
  });

  it('resolves generation + applies tags from the profile_ready frame', async () => {
    await flushInit();
    const ws = await startGenerating();
    ws.onmessage?.({
      data: wsFrame('profile_ready', {
        gcid: 'g',
        bio: 'fresh',
        tags: [{ category: 'science', tag: 'physics' }],
      }),
    });
    expect(component.generateState()).toEqual({ status: 'success' });
    expect(component.editingTags()).toEqual([{ category: 'science', tag: 'physics' }]);
    expect(component.bio()).toBe('fresh');
    // Intentional close: handlers are detached so the fallback never fires.
    expect(ws.closed).toBe(true);
    expect(ws.onmessage).toBeNull();
    expect(ws.onclose).toBeNull();
  });

  it('maps a profile_error frame to the generate error key', async () => {
    await flushInit();
    const ws = await startGenerating();
    ws.onmessage?.({ data: wsFrame('profile_error', { error: 'llm exploded' }) });
    expect(component.generateState()).toEqual({
      status: 'error',
      message: 'cplus.interests.generate_error',
    });
    expect(ws.closed).toBe(true);
  });

  it('ignores unknown WS frame kinds', async () => {
    await flushInit();
    const ws = await startGenerating();
    ws.onmessage?.({ data: wsFrame('something_else', {}) });
    expect(component.generateState().status).toBe('generating');
    expect(ws.closed).toBe(false);
  });

  it('ignores malformed WS frames', async () => {
    await flushInit();
    const ws = await startGenerating();
    ws.onmessage?.({ data: 'not-json{{{' });
    expect(component.generateState().status).toBe('generating');
  });

  it('arms the poll fallback when the WS closes without a frame', async () => {
    await flushInit();
    const ws = await startGenerating();
    expect(pollTimer()).toBeNull();
    ws.onclose?.();
    expect(pollTimer()).not.toBeNull();
  });

  it('polls GET after a WS constructor failure and resolves once tags arrive', async () => {
    // The 5s poll-fallback timer can't be driven from a fakeAsync body in
    // this runner (HTTP response continuations are delivered outside the
    // fake zone), so fake the browser timer instead (the notification.service
    // pattern) and let the real microtask loop settle the awaits.
    vi.useFakeTimers();
    try {
      fixture.detectChanges();
      httpMock
        .expectOne((r) => r.url.endsWith('/v1/me/profile'))
        .flush({ gcid: 'g', bio: 'math', tags: [] });
      httpMock.expectOne((r) => r.url.endsWith('/api/v1/me/courses')).flush({ courses: [] });
      await fixture.whenStable();
      stubToken('jwt-session');
      FakeWebSocket.throwOnConstruct = true;
      const p = component.generateProfile();
      const req = httpMock.expectOne((r) => r.url.endsWith('/v1/me/profile/generate'));
      req.flush({ status: 'generating', profile: { gcid: 'g', bio: 'math', tags: [] } });
      await p;
      expect(FakeWebSocket.instances).toHaveLength(0);
      expect(pollTimer()).not.toBeNull();

      // Fire the 5s poll-fallback timer.
      vi.advanceTimersByTime(5_000);
      const poll = httpMock.expectOne((r) => r.url.endsWith('/v1/me/profile'));
      poll.flush({
        gcid: 'g',
        bio: 'math',
        tags: [{ category: 'programming', tag: 'golang' }],
      });
      // The polled profile is applied, then the fallback's completion check
      // flips generateState to success one microtask-hop later — waitFor
      // drains the chain (and advances the fake timer clock) until it lands.
      await vi.waitFor(() => {
        expect(component.generateState()).toEqual({ status: 'success' });
      });
      expect(component.editingTags()).toEqual([{ category: 'programming', tag: 'golang' }]);
      expect(pollTimer()).toBeNull();
    } finally {
      FakeWebSocket.throwOnConstruct = false;
      vi.useRealTimers();
    }
  });

  it('saveTags is a no-op when nothing changed', async () => {
    await flushInit();
    await component.saveTags();
    expect(component.saveState().status).toBe('idle');
    httpMock.expectNone((r) => r.url.endsWith('/v1/me/profile/tags'));
  });

  it('saveTags PUTs the dirty tags and flips to saved', async () => {
    await flushInit();
    component.toggleTag('programming', 'kubernetes');
    expect(component.isDirty()).toBe(true);
    const p = component.saveTags();
    const req = httpMock.expectOne((r) => r.url.endsWith('/v1/me/profile/tags'));
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ tags: component.editingTags() });
    req.flush({ gcid: 'g', bio: 'b', tags: component.editingTags() });
    await p;
    expect(component.saveState()).toEqual({ status: 'saved' });
    expect(component.isDirty()).toBe(false);
  });

  it.each([
    [400, 'cplus.interests.error_invalid'],
    [501, 'cplus.interests.error_not_wired'],
    [503, 'cplus.interests.error_upstream'],
    [0, 'cplus.interests.error_generic'],
  ])('saveTags maps HTTP %i to the %s i18n key', async (status, key) => {
    await flushInit();
    component.toggleTag('programming', 'kubernetes');
    const p = component.saveTags();
    const req = httpMock.expectOne((r) => r.url.endsWith('/v1/me/profile/tags'));
    req.flush({}, { status, statusText: 'Error' });
    await p;
    expect(component.saveState()).toEqual({ status: 'error', message: key });
    // A failed save keeps the draft dirty so the user can retry.
    expect(component.isDirty()).toBe(true);
  });

  it('renders the selected tag pills + count', async () => {
    await flushInit();
    const pills = element.querySelectorAll('.cplus-interests-pill__label');
    expect(pills.length).toBe(2);
    expect(pills[0]?.textContent).toBe('Golang');
    expect(pills[1]?.textContent).toBe('Rust');
    expect(element.querySelector('.cplus-interests-tags__count')?.textContent).toContain('2');
  });

  it('renders the generate error message', async () => {
    await flushInit();
    const p = component.generateProfile();
    const req = httpMock.expectOne((r) => r.url.endsWith('/v1/me/profile/generate'));
    req.flush({}, { status: 500, statusText: 'Server Error' });
    await p;
    fixture.detectChanges();
    expect(element.querySelector('.cplus-interests-form__error')?.textContent).toContain(
      'cplus.interests.error_upstream',
    );
  });
});