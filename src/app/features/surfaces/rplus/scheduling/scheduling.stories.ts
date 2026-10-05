/**
 * SchedulingComponent Storybook stories — R+ Stage 3 wave-1-refresh (M6).
 *
 * Variants:
 *   - Empty           — BFF returns zero scheduled classes (grid renders
 *                       with hour rows but no session cards)
 *   - Populated       — CSPO Week-of-18-May 2026 fixture (6 × 3h sessions
 *                       Mon → Sat, MTM HQ Room 401)
 *   - Loading         — getCurrentWeek() Observable never emits
 *   - Error           — getCurrentWeek() Observable errors silently
 *
 * Stub strategy per `coding-angular-storybook` + `frontend-testing-stack`:
 *   - SchedulingService.getCurrentWeek() is replaced with a controllable
 *     Observable<SchedulingWeek>.
 *   - polyglass + R+ accent applied via global preview decorator.
 */
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig, moduleMetadata } from '@storybook/angular';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { NEVER, Observable, of, throwError } from 'rxjs';

import { SchedulingComponent } from './scheduling.component';
import { SchedulingService } from './scheduling.service';
import type {
  ClassSession,
  SchedulingCourseOption,
  SchedulingWeek,
} from './scheduling.model';

// ── Fixture builders ─────────────────────────────────────────────────────────

/**
 * The course catalogue the picker + grid-card title resolution read. Each
 * populated session references one of these by `courseId`, so the card renders
 * the real title rather than the opaque id.
 */
const COURSE_OPTIONS: readonly SchedulingCourseOption[] = [
  { id: 'course-1', label: 'CSPO Session 1: Scrum Foundations', instructorGcids: ['gcid-chen'] },
  { id: 'course-2', label: 'CSPO Session 2: Product Vision', instructorGcids: ['gcid-chen'] },
  { id: 'course-3', label: 'CSPO Session 3: Backlog Refinement', instructorGcids: ['gcid-chen'] },
  { id: 'course-4', label: 'CSPO Session 4: Sprint Planning', instructorGcids: ['gcid-chen'] },
  { id: 'course-5', label: 'CSPO Session 5: Review and Retro', instructorGcids: ['gcid-chen'] },
  { id: 'course-6', label: 'CSPO Session 6: Exam Prep', instructorGcids: ['gcid-chen'] },
];

function buildSession(overrides: Partial<ClassSession> = {}): ClassSession {
  return {
    sessionId: '01970000-0000-7000-8000-000000000001',
    courseId: 'course-1',
    courseCode: 'COURSE-1',
    day: 'monday',
    dateIso: '2026-05-18',
    startTime: '09:00',
    endTime: '12:00',
    durationHours: 3,
    instructorGcid: 'gcid-chen',
    roomId: '01985e7f-6666-7abc-8def-000000000401',
    venue: 'MTM HQ Room 401',
    maxCapacity: 25,
    ...overrides,
  };
}

const POPULATED_SESSIONS: readonly ClassSession[] = [
  buildSession({
    sessionId: 'cspo-mon',
    courseId: 'course-1',
    day: 'monday',
    dateIso: '2026-05-18',
    startTime: '09:00',
    endTime: '12:00',
  }),
  buildSession({
    sessionId: 'cspo-tue',
    courseId: 'course-2',
    day: 'tuesday',
    dateIso: '2026-05-19',
    startTime: '13:00',
    endTime: '16:00',
  }),
  buildSession({
    sessionId: 'cspo-wed',
    courseId: 'course-3',
    day: 'wednesday',
    dateIso: '2026-05-20',
    startTime: '09:00',
    endTime: '12:00',
  }),
  buildSession({
    sessionId: 'cspo-thu',
    courseId: 'course-4',
    day: 'thursday',
    dateIso: '2026-05-21',
    startTime: '13:00',
    endTime: '16:00',
  }),
  buildSession({
    sessionId: 'cspo-fri',
    courseId: 'course-5',
    day: 'friday',
    dateIso: '2026-05-22',
    startTime: '09:00',
    endTime: '12:00',
  }),
  buildSession({
    sessionId: 'cspo-sat',
    courseId: 'course-6',
    day: 'saturday',
    dateIso: '2026-05-23',
    startTime: '10:00',
    endTime: '13:00',
  }),
];

function stubServiceProvider(observable: Observable<SchedulingWeek>) {
  const svc: Pick<SchedulingService, 'getCurrentWeek' | 'listPublishedCourses'> = {
    getCurrentWeek: () => observable,
    listPublishedCourses: () => of(COURSE_OPTIONS),
  };
  return { provide: SchedulingService, useValue: svc };
}

function buildWeek(sessions: readonly ClassSession[]): SchedulingWeek {
  return {
    weekStartIso: '2026-05-18',
    weekLabel: 'Week of 18 May 2026',
    timezone: 'Asia/Singapore',
    timezoneLabel: 'SGT (UTC+08:00)',
    sessions,
  };
}

// ── Meta ─────────────────────────────────────────────────────────────────────

const meta: Meta<SchedulingComponent> = {
  title: 'Surfaces/R+/Scheduling (Week View)',
  component: SchedulingComponent,
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'tabletLandscape' },
    docs: {
      description: {
        component:
          'R+ Rhythm+ training-admin week-view scheduler (/r/scheduling, M6 refresh). ' +
          'Mon → Sun columns × hourly rows (08:00 → 18:00). Each session card spans its ' +
          'start/end hours via CSS Grid placement, with the R+ amber accent border.',
      },
    },
  },
  decorators: [
    moduleMetadata({ imports: [SchedulingComponent] }),
  ],
};
export default meta;

type Story = StoryObj<SchedulingComponent>;

// ── Story: Empty ─────────────────────────────────────────────────────────────

export const Empty: Story = {
  name: 'Empty — Quiet week (no sessions scheduled)',
  parameters: {
    docs: {
      description: {
        story:
          'Tenant has no scheduled classes in this ISO week. Header still renders the ' +
          'week label + Add CTA; the grid shows the hourly framework with no session cards.',
      },
    },
  },
  decorators: [
    applicationConfig({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        stubServiceProvider(of(buildWeek([]))),
      ],
    }),
  ],
};

// ── Story: Populated ─────────────────────────────────────────────────────────

export const Populated: Story = {
  name: 'Populated — CSPO Week of 18 May 2026 (6 sessions × 3h)',
  parameters: {
    docs: {
      description: {
        story:
          'Mr. Chen\'s CSPO cohort: 6 sessions Mon → Sat at MTM HQ Room 401, 3 hours each, ' +
          'morning + afternoon slots alternating. Session cards span their duration in CSS ' +
          'Grid rows.',
      },
    },
  },
  decorators: [
    applicationConfig({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        stubServiceProvider(of(buildWeek(POPULATED_SESSIONS))),
      ],
    }),
  ],
};

// ── Story: Loading ───────────────────────────────────────────────────────────

export const Loading: Story = {
  name: 'Loading — BFF pending',
  parameters: {
    docs: {
      description: {
        story:
          'BFF call still in-flight — toSignal at initial null. Week label + tz are blank ' +
          'strings; the hour-row scaffolding still renders.',
      },
    },
  },
  decorators: [
    applicationConfig({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        stubServiceProvider(NEVER),
      ],
    }),
  ],
};

// ── Story: Error ─────────────────────────────────────────────────────────────

export const Error: Story = {
  name: 'Error — BFF 5xx (silent fallthrough)',
  parameters: {
    docs: {
      description: {
        story:
          'BFF upstream fails. M6 has no fail-loud banner — error swallowed; week label ' +
          'stays empty + zero sessions paint. Fail-loud upgrade lands when error banner shared component drops.',
      },
    },
  },
  decorators: [
    applicationConfig({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        stubServiceProvider(
          throwError(() => ({ status: 503, message: 'Upstream Bad Gateway' })),
        ),
      ],
    }),
  ],
};
