/**
 * offerings.model — mapExamSittingToOffering (R3 exam-fold).
 *
 * The R+ nav de-shadow folds exam sittings (a SEPARATE bounded context) into
 * the unified Offerings finder as read-only rows. This is the pure adapter:
 * ExamSitting -> Offering-shaped finder row badged delivery_type=exam.
 *
 * It deliberately does NOT widen the shared `OfferingDeliveryType` union
 * (graduate|short|async): that union is consumed exhaustively by the offering
 * workspace tab matrix (`offering-workspace.tabs.ts`,
 * `Record<OfferingDeliveryType, …>`), where exam tabs are intentionally absent.
 * The `exam` discriminant is therefore a FE-synthesized badge token only
 * (`EXAM_DELIVERY_TYPE`), applied at this boundary like `mapBackendOffering`
 * casts the wire `delivery_type`.
 */
import { describe, it, expect } from 'vitest';

import {
  EXAM_DELIVERY_TYPE,
  deliveryTypeLabelKey,
  mapExamSittingToOffering,
  stateLabelKey,
  type OfferingState,
} from './offerings.model';
import type { ExamSitting, SittingStatus } from '../exams/exams.model';

function sitting(overrides: Partial<ExamSitting> = {}): ExamSitting {
  return {
    sittingId: 'ex-1',
    certTitle: 'Certified Scrum Product Owner',
    dateIso: '2026-06-12',
    dateLabel: '12 Jun 2026',
    venue: 'Room 5',
    capacity: 40,
    registered: 5,
    status: 'Open for registration',
    ...overrides,
  };
}

describe('mapExamSittingToOffering', () => {
  it('maps identity, label, capacity and dates onto an Offering finder row', () => {
    const row = mapExamSittingToOffering(sitting());

    expect(row.id).toBe('ex-1');
    expect(row.label).toBe('Certified Scrum Product Owner');
    expect(row.capacity).toBe(40);
    // The exam date drives both createdAt (sortable/displayable) and updatedAt.
    expect(row.createdAt).toBe('2026-06-12');
    expect(row.updatedAt).toBe('2026-06-12');
  });

  it('badges the row delivery_type=exam WITHOUT widening the offering FSM union', () => {
    const row = mapExamSittingToOffering(sitting());

    // Raw discriminant — cast to string because `exam` is intentionally not a
    // member of OfferingDeliveryType (graduate|short|async).
    expect(row.deliveryType as string).toBe('exam');
    expect(row.deliveryType as string).toBe(EXAM_DELIVERY_TYPE);
    // The exact i18n key the finder's delivery_type badge cell renders.
    expect(deliveryTypeLabelKey(row.deliveryType)).toBe(
      'rplus.offerings.delivery_type_value.exam',
    );
  });

  it('fills foreign-BC-absent fields with empty/neutral, type-honest defaults', () => {
    const row = mapExamSittingToOffering(sitting());

    expect(row.tenantId).toBe('');
    expect(row.courseId).toBe('');
    expect(row.courseIds).toEqual([]);
    expect(row.launchedAt).toBeNull();
    expect(row.concludedAt).toBeNull();
    expect(row.archivedAt).toBeNull();
  });

  it('projects every SittingStatus onto a real OfferingState so the state badge renders', () => {
    const cases: ReadonlyArray<readonly [SittingStatus, OfferingState]> = [
      ['Scheduled', 'LAUNCHED'],
      ['Open for registration', 'LAUNCHED'],
      ['Full', 'LAUNCHED'],
      ['In session', 'RUNNING'],
      ['Closed', 'CONCLUDED'],
    ];

    for (const [status, expected] of cases) {
      const row = mapExamSittingToOffering(sitting({ status }));
      expect(row.state).toBe(expected);
      // The mapped state has an existing i18n key (a real badge, not a raw key).
      expect(stateLabelKey(row.state)).toBe(`rplus.offerings.state_value.${expected}`);
    }
  });
});
