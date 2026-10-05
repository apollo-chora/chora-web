import { type Page } from '@playwright/test';

// ===========================================================================
// Route mocks — Phase 29 modules (CampusOps, Support, ExamAdmin, WBL, Parent)
// ===========================================================================

// ---------------------------------------------------------------------------
// CampusOps API mocks
// ---------------------------------------------------------------------------

export async function mockCampusopsAPI(
  page: Page,
  venues: Record<string, unknown>[],
  rooms: Record<string, unknown>[],
  bookings: Record<string, unknown>[],
): Promise<void> {
  await page.route('**/api/v1/campusops/venues', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: venues, total: venues.length }),
      });
    } else {
      await route.fallback();
    }
  });

  await page.route('**/api/v1/campusops/rooms', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: rooms, total: rooms.length }),
      });
    } else {
      await route.fallback();
    }
  });

  await page.route('**/api/v1/campusops/bookings', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: bookings, total: bookings.length }),
      });
    } else if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'booking-new', status: 'confirmed', ...body }),
      });
    } else {
      await route.fallback();
    }
  });
}

export async function mockCampusopsTimetable(
  page: Page,
  slots: Record<string, unknown>[],
): Promise<void> {
  await page.route('**/api/v1/campusops/timetable**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: slots, total: slots.length }),
    });
  });
}

export async function mockCampusopsAttendance(
  page: Page,
  sessions: Record<string, unknown>[],
): Promise<void> {
  await page.route('**/api/v1/campusops/attendance**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: sessions, total: sessions.length }),
      });
    } else if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ marked: true, timestamp: new Date().toISOString() }),
      });
    } else {
      await route.fallback();
    }
  });
}

// ---------------------------------------------------------------------------
// Support API mocks
// ---------------------------------------------------------------------------

export async function mockSupportAPI(
  page: Page,
  tickets: Record<string, unknown>[],
  faqArticles: Record<string, unknown>[],
): Promise<void> {
  await page.route('**/api/v1/support/tickets', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: tickets, total: tickets.length }),
      });
    } else if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'ticket-new', status: 'open', ...body }),
      });
    } else {
      await route.fallback();
    }
  });

  // Single ticket detail by ID
  await page.route('**/api/v1/support/tickets/*', async (route) => {
    const url = route.request().url();
    // Avoid matching sub-resources like /tickets/*/replies
    if (url.match(/\/tickets\/[^/]+$/)) {
      const ticketId = url.split('/').pop();
      const ticket = tickets.find((t) => t['id'] === ticketId) ?? tickets[0] ?? null;
      if (ticket) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(ticket),
        });
      } else {
        await route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"not found"}' });
      }
    } else {
      await route.fallback();
    }
  });

  await page.route('**/api/v1/support/faq', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: faqArticles, total: faqArticles.length }),
    });
  });
}

export async function mockSupportTicketReplies(
  page: Page,
  replies: Record<string, unknown>[],
): Promise<void> {
  await page.route('**/api/v1/support/tickets/*/replies', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: replies }),
      });
    } else if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'reply-new', ...body }),
      });
    } else {
      await route.fallback();
    }
  });
}

export async function mockSupportSatisfaction(
  page: Page,
  response: Record<string, unknown> | null = null,
): Promise<void> {
  await page.route('**/api/v1/support/tickets/*/satisfaction', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: response ? 200 : 404,
        contentType: 'application/json',
        body: JSON.stringify(response ?? { error: 'not found' }),
      });
    } else if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'sat-new', ...body }),
      });
    } else {
      await route.fallback();
    }
  });
}

// ---------------------------------------------------------------------------
// ExamAdmin API mocks
// ---------------------------------------------------------------------------

export async function mockExamAdminAPI(
  page: Page,
  contracts: Record<string, unknown>[],
  sittings: Record<string, unknown>[],
): Promise<void> {
  await page.route('**/api/v1/exam-admin/contracts', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: contracts, total: contracts.length }),
    });
  });

  await page.route('**/api/v1/exam-admin/sittings', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: sittings, total: sittings.length }),
      });
    } else if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'sitting-new', status: 'scheduled', ...body }),
      });
    } else {
      await route.fallback();
    }
  });
}

export async function mockExamAdminVenues(
  page: Page,
  venues: Record<string, unknown>[],
): Promise<void> {
  await page.route('**/api/v1/exam-admin/venues', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: venues, total: venues.length }),
    });
  });
}

export async function mockExamAdminProctor(
  page: Page,
  activeSittings: Record<string, unknown>[],
  alerts: Record<string, unknown>[] = [],
): Promise<void> {
  await page.route('**/api/v1/exam-admin/proctor/active', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: activeSittings }),
    });
  });

  await page.route('**/api/v1/exam-admin/proctor/alerts', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: alerts }),
    });
  });
}

export async function mockExamAdminResults(
  page: Page,
  results: Record<string, unknown>[],
): Promise<void> {
  await page.route('**/api/v1/exam-admin/results', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: results, total: results.length }),
    });
  });
}

// ---------------------------------------------------------------------------
// WBL API mocks
// ---------------------------------------------------------------------------

export async function mockWblAPI(
  page: Page,
  placements: Record<string, unknown>[],
  workLogs: Record<string, unknown>[],
): Promise<void> {
  await page.route('**/api/v1/wbl/placements', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: placements, total: placements.length }),
      });
    } else {
      await route.fallback();
    }
  });

  // Single placement detail by ID
  await page.route('**/api/v1/wbl/placements/*', async (route) => {
    const url = route.request().url();
    if (url.match(/\/placements\/[^/]+$/) && route.request().method() === 'GET') {
      const placementId = url.split('/').pop();
      const placement = placements.find((p) => p['id'] === placementId) ?? placements[0] ?? null;
      if (placement) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(placement),
        });
      } else {
        await route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"not found"}' });
      }
    } else {
      await route.fallback();
    }
  });

  await page.route('**/api/v1/wbl/placements/*/work-log', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: workLogs, total: workLogs.length }),
      });
    } else if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'log-new', supervisor_approved: false, ...body }),
      });
    } else {
      await route.fallback();
    }
  });
}

export async function mockWblCapstone(
  page: Page,
  capstone: Record<string, unknown>,
): Promise<void> {
  await page.route('**/api/v1/wbl/placements/*/capstone', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(capstone),
    });
  });
}

export async function mockWblFeedback(
  page: Page,
  feedback: Record<string, unknown>[],
): Promise<void> {
  await page.route('**/api/v1/wbl/placements/*/feedback', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: feedback }),
    });
  });
}

// ---------------------------------------------------------------------------
// Parent API mocks
// ---------------------------------------------------------------------------

export async function mockParentAPI(
  page: Page,
  links: Record<string, unknown>[],
  digests: Record<string, unknown>[],
): Promise<void> {
  await page.route('**/api/v1/parent/links', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: links, total: links.length }),
      });
    } else if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'link-new', link_status: 'active', ...body }),
      });
    } else {
      await route.fallback();
    }
  });

  await page.route('**/api/v1/parent/activity**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: digests, total: digests.length }),
    });
  });
}

export async function mockParentDashboard(
  page: Page,
  summary: Record<string, unknown>,
): Promise<void> {
  await page.route('**/api/v1/parent/dashboard', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(summary),
    });
  });
}

export async function mockParentProgressReport(
  page: Page,
  report: Record<string, unknown>,
): Promise<void> {
  await page.route('**/api/v1/parent/progress**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(report),
    });
  });
}

export async function mockParentConsent(
  page: Page,
  consents: Record<string, unknown>[],
): Promise<void> {
  await page.route('**/api/v1/parent/consent', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: consents }),
      });
    } else if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    } else {
      await route.fallback();
    }
  });
}

export async function mockParentConsentHistory(
  page: Page,
  history: Record<string, unknown>[],
): Promise<void> {
  await page.route('**/api/v1/parent/consent/history', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: history }),
    });
  });
}
