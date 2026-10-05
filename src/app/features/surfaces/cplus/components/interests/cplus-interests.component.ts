import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import { BffClientService } from '../../../../../core/services/bff-client.service';
import { AuthService } from '../../../../../core/auth/auth.service';
import { CplusPageHeaderComponent } from '../shared/cplus-page-header/cplus-page-header.component';
import { CplusCardComponent } from '../shared/cplus-card/cplus-card.component';
import type { CplusBreadcrumbItem } from '../shared/cplus-breadcrumb/cplus-breadcrumb.component';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { environment } from '../../../../../../environments/environment';

interface InterestTag {
  category: string;
  tag: string;
}

interface Profile {
  gcid: string;
  bio: string;
  tags: InterestTag[] | null;
  proficiency?: { per_category?: Record<string, string> };
  course_titles?: string[];
  updated_at?: string;
}

interface CategoryGroup {
  key: string;
  label: string;
  tags: InterestTag[];
}

type ProfileState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; profile: Profile }
  | { status: 'error'; message: string };

type GenerateState =
  | { status: 'idle' }
  | { status: 'generating' }
  | { status: 'success' }
  | { status: 'error'; message: string };

type SaveState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'saved' }
  | { status: 'error'; message: string };

const CATEGORY_ORDER = [
  'programming',
  'mathematics',
  'science',
  'humanities',
  'arts',
  'languages',
] as const;

const CATEGORY_LABELS: Readonly<Record<string, string>> = {
  programming: 'Programming',
  mathematics: 'Mathematics',
  science: 'Science',
  humanities: 'Humanities',
  arts: 'Arts',
  languages: 'Languages',
};


function tagKey(category: string, tag: string): string {
  return `${category}::${tag}`;
}

function humanizeTag(tag: string): string {
  return tag
    .split('_')
    .map((s) => (s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s))
    .join(' ');
}

function serializeTags(tags: readonly InterestTag[]): string {
  return tags
    .slice()
    .sort((a, b) =>
      a.category === b.category
        ? a.tag.localeCompare(b.tag)
        : a.category.localeCompare(b.category),
    )
    .map((t) => tagKey(t.category, t.tag))
    .join('|');
}

@Component({
  selector: 'chora-cplus-interests',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe, CplusPageHeaderComponent, CplusCardComponent],
  templateUrl: './cplus-interests.component.html',
  styleUrl: './cplus-interests.component.scss',
})
export class CplusInterestsComponent implements OnInit, OnDestroy {
  private readonly bff = inject(BffClientService);
  private readonly auth = inject(AuthService);

  readonly breadcrumb: CplusBreadcrumbItem[] = [
    { label: 'C+', path: '/c/feed' },
    { label: 'Interests', path: null },
  ];

  readonly categoryOrder = CATEGORY_ORDER;
  readonly categoryLabels = CATEGORY_LABELS;

  readonly bio = signal('');
  readonly completedCourses = signal<readonly string[]>([]);
  readonly profileState = signal<ProfileState>({ status: 'idle' });
  readonly generateState = signal<GenerateState>({ status: 'idle' });
  readonly saveState = signal<SaveState>({ status: 'idle' });
  readonly editingTags = signal<InterestTag[]>([]);
  readonly activePickerCategory = signal<string>('programming');
  private readonly savedSnapshot = signal('');
  readonly hasProfile = computed(() => this.profileState().status === 'success');

  readonly hasAnyTags = computed(() => this.editingTags().length > 0);

  readonly tagCount = computed(() => this.editingTags().length);

  readonly isDirty = computed(
    () => serializeTags(this.editingTags()) !== this.savedSnapshot(),
  );

  readonly selectedKeys = computed(() => {
    const keys = new Set<string>();
    for (const t of this.editingTags()) {
      keys.add(tagKey(t.category, t.tag));
    }
    return keys;
  });

  readonly groupedTags = computed<readonly CategoryGroup[]>(() => {
    const byCat = new Map<string, InterestTag[]>();
    for (const t of this.editingTags()) {
      const list = byCat.get(t.category) ?? [];
      list.push(t);
      byCat.set(t.category, list);
    }
    const groups: CategoryGroup[] = [];
    for (const key of CATEGORY_ORDER) {
      const tags = byCat.get(key);
      if (tags && tags.length > 0) {
        groups.push({
          key,
          label: CATEGORY_LABELS[key] ?? key,
          tags: tags.slice().sort((a, b) => a.tag.localeCompare(b.tag)),
        });
      }
    }
    // Any unknown categories last
    for (const [key, tags] of byCat) {
      if (!CATEGORY_ORDER.includes(key as (typeof CATEGORY_ORDER)[number])) {
        groups.push({
          key,
          label: CATEGORY_LABELS[key] ?? humanizeTag(key),
          tags: tags.slice().sort((a, b) => a.tag.localeCompare(b.tag)),
        });
      }
    }
    return groups;
  });

  // newTagInput holds the text the user is typing into the free-form tag
  // input for the active picker category. Tags are free-form strings within
  // a category (e.g. "golang", "rust", "system_design" in programming) —
  // the backend IsValidTag validates the category + non-empty tag, not a
  // closed vocabulary.
  readonly newTagInput = signal('');

  // profileWS is the WebSocket subscribed to /v1/me/profile/ws while a
  // generation is in-flight. Null when idle. Closed on profile_ready,
  // profile_error, component teardown, or a 5s fallback-to-poll timer.
  private profileWS: WebSocket | null = null;
  private profileWSReceivedMessage = false;
  private pollFallbackTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    void this.loadProfile();
    void this.loadCompletedCourses();
  }

  ngOnDestroy(): void {
    this.closeProfileWS();
    if (this.pollFallbackTimer) {
      clearTimeout(this.pollFallbackTimer);
      this.pollFallbackTimer = null;
    }
  }

  labelForCategory(category: string): string {
    return CATEGORY_LABELS[category] ?? humanizeTag(category);
  }

  labelForTag(tag: string): string {
    return humanizeTag(tag);
  }

  isSelected(category: string, tag: string): boolean {
    return this.selectedKeys().has(tagKey(category, tag));
  }

  selectPickerCategory(category: string): void {
    this.activePickerCategory.set(category);
  }

  toggleTag(category: string, tag: string): void {
    if (this.isSelected(category, tag)) {
      this.removeTag(category, tag);
      return;
    }
    this.editingTags.update((tags) => [...tags, { category, tag }]);
    this.saveState.set({ status: 'idle' });
  }

  // addCustomTag reads newTagInput, slugifies it (lowercase, spaces →
  // underscores, trim non-alphanumeric/underscore), + adds it to the
  // active picker category. Empty/whitespace-only input is a no-op.
  // Duplicate (category, tag) is silently ignored (toggleTag would
  // remove it, so we guard with isSelected).
  addCustomTag(): void {
    const raw = this.newTagInput().trim();
    if (raw === '') return;
    const slug = raw
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');
    if (slug === '') return;
    const category = this.activePickerCategory();
    if (!this.isSelected(category, slug)) {
      this.editingTags.update((tags) => [...tags, { category, tag: slug }]);
      this.saveState.set({ status: 'idle' });
    }
    this.newTagInput.set('');
  }

  removeTag(category: string, tag: string): void {
    this.editingTags.update((tags) =>
      tags.filter((t) => !(t.category === category && t.tag === tag)),
    );
    this.saveState.set({ status: 'idle' });
  }

  private async loadCompletedCourses(): Promise<void> {
    try {
      const resp = await firstValueFrom(
        this.bff.get<{ courses: { title: string }[] }>('/api/v1/me/courses'),
      );
      const titles = (resp.courses ?? []).map((c) => c.title);
      this.completedCourses.set(titles);
    } catch {
      // Courses optional — bio alone is enough for generate.
    }
  }

  async loadProfile(): Promise<void> {
    this.profileState.set({ status: 'loading' });
    try {
      const resp = await firstValueFrom(this.bff.get<Profile>('/v1/me/profile'));
      if (resp) {
        this.applyProfile(resp);
      } else {
        this.profileState.set({ status: 'idle' });
      }
    } catch {
      this.profileState.set({ status: 'idle' });
    }
  }

  // generateProfile is fire-and-forget: POST returns 202 immediately with
  // the persisted "generating" state (bio saved, tags empty). We then
  // open a WebSocket to /v1/me/profile/ws to receive the profile_ready /
  // profile_error frame when the background LLM call resolves (~30-60s).
  //
  // Fallback: if the WS closes without delivering a frame (proxy failure,
  // network drop, agent crash), we poll GET /v1/me/profile after a 5s
  // delay — the persisted profile will eventually hold the final tags.
  async generateProfile(): Promise<void> {
    this.generateState.set({ status: 'generating' });
    this.saveState.set({ status: 'idle' });
    // Close any leftover WS from a prior generation attempt.
    this.closeProfileWS();

    const courses = [...this.completedCourses()];
    try {
      const resp = await firstValueFrom(
        this.bff.post<Profile | { status: string; profile: Profile }>(
          '/v1/me/profile/generate',
          { bio: this.bio(), course_titles: courses },
        ),
      );
      // The 202 body is { status: "generating", profile: {...} } (async
      // path) OR a bare Profile (sync path — e.g. a future fast-path or
      // a mock). Handle both.
      const profile =
        resp && typeof resp === 'object' && 'profile' in resp
          ? (resp as { profile: Profile }).profile
          : (resp as Profile);
      if (profile) {
        this.applyProfile(profile);
      }
      // Open the WS to receive the completion frame.
      this.connectProfileWS();
    } catch (err: unknown) {
      this.generateState.set({
        status: 'error',
        message: this.errorKey(err),
      });
    }
  }

  // connectProfileWS opens the WebSocket + wires the frame handlers.
  // Browsers cannot set the Authorization header on a native WebSocket
  // handshake (RFC 6455), so the session JWT rides as ?access_token=
  // (the gateway's extractSessionToken accepts it for WS upgrades only).
  private connectProfileWS(): void {
    const token = this.auth.getToken();
    const tokenParam = token ? `?access_token=${encodeURIComponent(token)}` : '';
    const wsUrl = `${environment.wsBaseUrl}/v1/me/profile/ws${tokenParam}`;

    this.profileWSReceivedMessage = false;
    try {
      this.profileWS = new WebSocket(wsUrl);
    } catch {
      // WebSocket constructor throws on malformed URLs — fall back to polling.
      this.schedulePollFallback();
      return;
    }

    this.profileWS.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as { kind: string; payload: unknown };
        this.handleProfileWSMessage(msg);
      } catch {
        // Ignore malformed frames — the server only sends profile_ready /
        // profile_error, both JSON. A malformed frame doesn't change state.
      }
    };

    // If the WS closes before we received a frame, the generation result
    // was lost in flight (proxy drop, agent crash, gateway restart).
    // Fall back to polling GET /v1/me/profile after a 5s delay — the
    // persisted profile will hold the final tags once the goroutine
    // completes (or stay empty if it crashed, which the user can retry).
    this.profileWS.onclose = () => {
      if (!this.profileWSReceivedMessage) {
        this.schedulePollFallback();
      }
    };

    // onerror is always followed by onclose — no separate handling needed.
  }

  private handleProfileWSMessage(msg: { kind: string; payload: unknown }): void {
    this.profileWSReceivedMessage = true;
    switch (msg.kind) {
      case 'profile_ready': {
        const profile = msg.payload as Profile;
        if (profile) {
          this.applyProfile(profile);
        }
        this.generateState.set({ status: 'success' });
        this.closeProfileWS();
        break;
      }
      case 'profile_error': {
        const p = msg.payload as { error?: string };
        this.generateState.set({
          status: 'error',
          message: 'cplus.interests.generate_error',
        });
        this.closeProfileWS();
        // Best-effort: the persisted profile may still be in the generating
        // state, but the error is the actionable signal — don't overwrite.
        void p;
        break;
      }
      default:
        // Unknown frame kind — ignore. The server only sends the two above.
        break;
    }
  }

  // schedulePollFallback waits 5s then re-reads the profile via REST. If
  // the background goroutine completed + persisted the final tags, this
  // surfaces them; if it's still running, the profile stays in the
  // generating state + the user can refresh manually.
  private schedulePollFallback(): void {
    if (this.pollFallbackTimer) {
      clearTimeout(this.pollFallbackTimer);
    }
    this.pollFallbackTimer = setTimeout(() => {
      this.pollFallbackTimer = null;
      void this.loadProfile().then(() => {
        // If the polled profile now has tags, treat it as success.
        if (this.generateState().status === 'generating' && this.hasAnyTags()) {
          this.generateState.set({ status: 'success' });
        }
      });
    }, 5000);
  }

  private closeProfileWS(): void {
    if (this.profileWS) {
      // Clear handlers before close so the onclose fallback doesn't fire
      // (we're closing intentionally, not because of a proxy drop).
      this.profileWS.onclose = null;
      this.profileWS.onmessage = null;
      this.profileWS.onerror = null;
      this.profileWS.onopen = null;
      try {
        this.profileWS.close();
      } catch {
        // Already closed — ignore.
      }
      this.profileWS = null;
    }
  }

  async saveTags(): Promise<void> {
    if (!this.isDirty()) return;
    this.saveState.set({ status: 'saving' });
    try {
      const resp = await firstValueFrom(
        this.bff.put<Profile>('/v1/me/profile/tags', {
          tags: this.editingTags(),
        }),
      );
      if (resp) {
        this.applyProfile(resp);
        this.saveState.set({ status: 'saved' });
      }
    } catch (err: unknown) {
      this.saveState.set({
        status: 'error',
        message: this.errorKey(err),
      });
    }
  }

  private applyProfile(profile: Profile): void {
    const tags = [...(profile.tags ?? [])];
    this.profileState.set({ status: 'success', profile });
    this.editingTags.set(tags);
    this.bio.set(profile.bio ?? '');
    this.savedSnapshot.set(serializeTags(tags));
    // Prefer first selected category in picker, else first taxonomy category.
    const first = tags[0]?.category ?? CATEGORY_ORDER[0];
    this.activePickerCategory.set(first);
  }

  private errorKey(err: unknown): string {
    const e = err as { status?: number };
    if (typeof e?.status === 'number') {
      if (e.status === 401) return 'cplus.interests.error_unauthenticated';
      if (e.status === 403) return 'cplus.interests.error_forbidden';
      if (e.status === 400) return 'cplus.interests.error_invalid';
      if (e.status === 501) return 'cplus.interests.error_not_wired';
      if (e.status >= 500) return 'cplus.interests.error_upstream';
    }
    return 'cplus.interests.error_generic';
  }
}
