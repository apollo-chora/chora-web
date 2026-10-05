/**
 * BookingsComponent Storybook stories - R+ /r/bookings.
 *
 * The screen hydrates from GET /api/bookings (CHO-1622) on init, then keeps the
 * list live by prepending create() results + patching status rows in place. The
 * create form (CHO-2336) composes two pickers - a class dropdown sourced from
 * BookingsService.listBookableClasses() and the shared `chora-member-multiselect`
 * (learners, capped to one). The stories therefore stub BookingsService AND the
 * member picker's directory, then drive state through the public surface:
 *
 *   - Empty      - list() resolves empty -> loaded empty-state row
 *   - Populated  - `play` picks a class + a learner and submits twice so the
 *                  list shows two rows (VRT baseline)
 *   - Error      - create() rejects with a 409; fail-loud mutation banner renders
 *
 * Stub strategy per `coding-angular-storybook` + `frontend-testing-stack`:
 *   - BookingsService.list() resolves empty so the screen reaches 'loaded';
 *     listBookableClasses() resolves a small class set for the dropdown;
 *     create() / updateStatus() are controllable Observables - no real BFF.
 *   - MemberDirectoryService.listMembers() resolves a small learner set so the
 *     reused checklist renders without a tenant-members round-trip.
 *   - polyglass shell + R+ accent come from the global preview decorator.
 */
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig, moduleMetadata } from '@storybook/angular';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { expect, userEvent, within } from 'storybook/test';
import { Observable, of, throwError } from 'rxjs';

import { BookingsComponent } from './bookings.component';
import { BookingsService, type CreateBookingRequest } from './bookings.service';
import type { Booking, BookingStatus, ClassOption } from './bookings.model';
import { MemberDirectoryService } from '../../../../shared/components/member-multiselect/member-directory.service';
import type { TenantMemberSummary } from '../assessments/assessment-instantiation/assessment-instantiation.model';

// ── Fixture builders ─────────────────────────────────────────────────────────

let seq = 0;

function buildBooking(overrides: Partial<Booking> = {}): Booking {
  seq += 1;
  return {
    id: `01970000-0000-7000-8000-00000000000${seq}`,
    classId: 'cls-dsa-101',
    courseId: 'course-dsa-101',
    tenantId: '01970000-0000-7000-8000-000000000aaa',
    learnerGcid: '01970000-0000-7000-8000-000000000bbb',
    status: 'pending' as BookingStatus,
    createdAt: '2026-05-26T10:00:00Z',
    updatedAt: '2026-05-26T10:00:00Z',
    ...overrides,
  };
}

/** Class-picker options the stubbed listBookableClasses resolves. */
const CLASS_OPTIONS: readonly ClassOption[] = [
  { id: 'cls-dsa-101', label: 'DSA101 · 2026-05-19 09:00 · MTM HQ Room 401' },
  { id: 'cls-cspo-2026a', label: 'CSPO · 2026-05-20 13:00 · MTM HQ Room 402' },
];

const LG1 = '01970000-0000-7000-8000-0000000000a1';
const LG2 = '01970000-0000-7000-8000-0000000000a2';

function buildLearner(gcid: string, name: string, email: string): TenantMemberSummary {
  return {
    gcid,
    email,
    display_name: name,
    avatar_url: null,
    roles: ['LEARNER'],
    last_active_at: '2026-07-20T00:00:00Z',
  };
}

const LEARNERS: readonly TenantMemberSummary[] = [
  buildLearner(LG1, 'Phyllis Learner', 'phyllis@mtm.sg'),
  buildLearner(LG2, 'Mei Learner', 'mei@mtm.sg'),
];

/**
 * Stub the bookings service. `create` echoes the requested class/learner back
 * as a fresh booking; `updateStatus` echoes the new status; `listBookableClasses`
 * resolves the class options. An optional override lets the Error story force a
 * rejection.
 */
function stubBookingsProvider(opts?: {
  createOverride?: (req: CreateBookingRequest) => Observable<Booking>;
}) {
  const svc: Pick<
    BookingsService,
    'create' | 'updateStatus' | 'list' | 'listBookableClasses'
  > = {
    create: (req) =>
      opts?.createOverride
        ? opts.createOverride(req)
        : of(buildBooking({ classId: req.classId, learnerGcid: req.learnerGcid })),
    updateStatus: (id, status) => of(buildBooking({ id, status })),
    list: () => of<readonly Booking[]>([]),
    listBookableClasses: () => of<readonly ClassOption[]>(CLASS_OPTIONS),
  };
  return { provide: BookingsService, useValue: svc };
}

/** Stub the reused member picker's directory so it renders without HTTP. */
function stubMemberDirectoryProvider() {
  return {
    provide: MemberDirectoryService,
    useValue: { listMembers: () => of<readonly TenantMemberSummary[]>(LEARNERS) },
  };
}

// ── Meta ─────────────────────────────────────────────────────────────────────

const meta: Meta<BookingsComponent> = {
  title: 'Surfaces/R+/Bookings',
  component: BookingsComponent,
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'tabletPortrait' },
    docs: {
      description: {
        component:
          'R+ Rhythm+ training-admin class-booking console (/r/bookings). ' +
          'The create form composes a class dropdown + the shared member ' +
          'checklist so a trainer never hand-types a UUID (CHO-2336). The ' +
          'screen hydrates from GET /api/bookings (CHO-1622), then prepends ' +
          'POST creates + PATCHes each row status (pending -> confirmed -> ' +
          'attended / no-show).',
      },
    },
  },
  decorators: [moduleMetadata({ imports: [BookingsComponent] })],
};
export default meta;

type Story = StoryObj<BookingsComponent>;

// ── Story: Empty ─────────────────────────────────────────────────────────────

export const Empty: Story = {
  name: 'Empty - No bookings yet',
  parameters: {
    docs: {
      description: {
        story:
          'Default render - the admin has not created any bookings this ' +
          'session. The create form (class dropdown + learner checklist) sits ' +
          'above an empty-state row.',
      },
    },
  },
  decorators: [
    applicationConfig({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        stubBookingsProvider(),
        stubMemberDirectoryProvider(),
      ],
    }),
  ],
};

// ── Story: Populated ─────────────────────────────────────────────────────────

export const Populated: Story = {
  name: 'Populated - 2 bookings created',
  parameters: {
    docs: {
      description: {
        story:
          'The `play` step picks a class + a learner and submits twice so the ' +
          'list renders two booking rows, each with a status <select>.',
      },
    },
  },
  decorators: [
    applicationConfig({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        stubBookingsProvider(),
        stubMemberDirectoryProvider(),
      ],
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // First booking: pick a class + a learner, then create.
    await userEvent.selectOptions(canvas.getByTestId('bookings-class-picker'), 'cls-dsa-101');
    await userEvent.click(canvas.getByTestId(`member-multiselect-option-${LG1}`));
    await userEvent.click(canvas.getByTestId('bookings-create-cta'));

    // The form resets (learner checklist re-mounts); pick again + create.
    await userEvent.selectOptions(canvas.getByTestId('bookings-class-picker'), 'cls-cspo-2026a');
    await userEvent.click(canvas.getByTestId(`member-multiselect-option-${LG2}`));
    await userEvent.click(canvas.getByTestId('bookings-create-cta'));

    await expect(canvas.getByTestId('bookings-total')).toHaveTextContent('2');
  },
};

// ── Story: Error ─────────────────────────────────────────────────────────────

export const Error: Story = {
  name: 'Error - 409 over-capacity (fail-loud banner)',
  parameters: {
    docs: {
      description: {
        story:
          'The backend rejects the create with 409 (class at capacity). The ' +
          'screen renders the fail-loud error banner instead of a row.',
      },
    },
  },
  decorators: [
    applicationConfig({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        stubBookingsProvider({
          createOverride: () =>
            throwError(() => ({ status: 409, message: 'class at capacity' })),
        }),
        stubMemberDirectoryProvider(),
      ],
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.selectOptions(canvas.getByTestId('bookings-class-picker'), 'cls-dsa-101');
    await userEvent.click(canvas.getByTestId(`member-multiselect-option-${LG1}`));
    await userEvent.click(canvas.getByTestId('bookings-create-cta'));
    await expect(canvas.getByTestId('bookings-mutation-error')).toBeInTheDocument();
  },
};
