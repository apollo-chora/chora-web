import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { AdminTopicService } from './admin-topic.service';
import { environment } from '../../../../../environments/environment';
import type {
  TopicNode,
  TopicNodeDTO,
  CreateTopicRequest,
  UpdateTopicRequest,
  MoveTopicRequest,
} from '../models/admin-topic.model';

/**
 * Wire DTO builder — mirrors EXACTLY the flat per-node projection returned by
 * GET /api/v1/topics (chora-creation topic_handler.go): no `tenant_id`, no
 * `children`.
 */
function buildDto(overrides: Partial<TopicNodeDTO> = {}): TopicNodeDTO {
  return {
    id: 'topic-001',
    name: 'Mathematics',
    parent_id: null,
    sort_order: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    ...overrides,
  };
}

function buildNode(overrides: Partial<TopicNode> = {}): TopicNode {
  return { ...buildDto(), children: [], ...overrides };
}

describe('AdminTopicService', () => {
  let service: AdminTopicService;
  let httpMock: HttpTestingController;
  const baseUrl = environment.bffBaseUrl;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        AdminTopicService,
      ],
    });
    service = TestBed.inject(AdminTopicService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  // -------------------------------------------------------------------------
  // getTopicTree — unwraps { data: [...] } and BUILDS the nested tree client-side
  // -------------------------------------------------------------------------

  describe('getTopicTree', () => {
    it('sends GET to /api/v1/topics and builds a tree from the flat {data} list', () => {
      let result: TopicNode[] | undefined;
      service.getTopicTree().subscribe((r) => (result = r));

      const req = httpMock.expectOne(`${baseUrl}/api/v1/topics`);
      expect(req.request.method).toBe('GET');

      // The live wire is { data: [FLAT dto, ...] } — NOT a pre-nested array.
      req.flush({
        data: [
          buildDto({ id: 'topic-001', name: 'Mathematics', parent_id: null }),
          buildDto({ id: 'topic-002', name: 'Algebra', parent_id: 'topic-001' }),
          buildDto({ id: 'topic-003', name: 'Science', parent_id: null }),
        ],
      });

      expect(result).toBeTruthy();
      expect(result!).toHaveLength(2);
      expect(result![0].id).toBe('topic-001');
      expect(result![0].children).toHaveLength(1);
      expect(result![0].children[0].name).toBe('Algebra');
      expect(result![1].id).toBe('topic-003');
    });

    it('returns empty array when no topics exist (empty data)', () => {
      let result: TopicNode[] | undefined;
      service.getTopicTree().subscribe((r) => (result = r));

      const req = httpMock.expectOne(`${baseUrl}/api/v1/topics`);
      req.flush({ data: [] });

      expect(result).toEqual([]);
    });

    it('coalesces a missing data field to an empty array', () => {
      let result: TopicNode[] | undefined;
      service.getTopicTree().subscribe((r) => (result = r));

      const req = httpMock.expectOne(`${baseUrl}/api/v1/topics`);
      req.flush({});

      expect(result).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // createTopic
  // -------------------------------------------------------------------------

  describe('createTopic', () => {
    it('sends POST to /api/v1/topics with the create body', () => {
      const request: CreateTopicRequest = {
        name: 'Physics',
        parent_id: null,
        sort_order: 1,
      };

      let result: TopicNodeDTO | undefined;
      service.createTopic(request).subscribe((r) => (result = r));

      const req = httpMock.expectOne(`${baseUrl}/api/v1/topics`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(request);

      req.flush(buildDto({ id: 'topic-new', name: 'Physics', sort_order: 1 }));

      expect(result).toBeTruthy();
      expect(result!.name).toBe('Physics');
    });

    it('sends POST with parent_id for a child topic', () => {
      const request: CreateTopicRequest = {
        name: 'Mechanics',
        parent_id: 'topic-001',
      };

      service.createTopic(request).subscribe();

      const req = httpMock.expectOne(`${baseUrl}/api/v1/topics`);
      expect(req.request.body.parent_id).toBe('topic-001');

      req.flush(buildDto({ name: 'Mechanics', parent_id: 'topic-001' }));
    });
  });

  // -------------------------------------------------------------------------
  // updateTopic (rename / reorder)
  // -------------------------------------------------------------------------

  describe('updateTopic', () => {
    it('sends PUT to /api/v1/topics/{id} with the update body', () => {
      const request: UpdateTopicRequest = {
        name: 'Advanced Mathematics',
        sort_order: 2,
      };

      let result: TopicNodeDTO | undefined;
      service.updateTopic('topic-001', request).subscribe((r) => (result = r));

      const req = httpMock.expectOne(`${baseUrl}/api/v1/topics/topic-001`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual(request);

      req.flush(buildDto({ name: 'Advanced Mathematics', sort_order: 2 }));

      expect(result!.name).toBe('Advanced Mathematics');
    });

    it('url-encodes the id segment', () => {
      service.updateTopic('a/b', { name: 'X' }).subscribe();
      const req = httpMock.expectOne(`${baseUrl}/api/v1/topics/a%2Fb`);
      expect(req.request.method).toBe('PUT');
      req.flush(buildDto({ id: 'a/b', name: 'X' }));
    });
  });

  // -------------------------------------------------------------------------
  // deleteTopic (soft-delete -> 204)
  // -------------------------------------------------------------------------

  describe('deleteTopic', () => {
    it('sends DELETE to /api/v1/topics/{id}', () => {
      let completed = false;
      service.deleteTopic('topic-001').subscribe(() => (completed = true));

      const req = httpMock.expectOne(`${baseUrl}/api/v1/topics/topic-001`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null, { status: 204, statusText: 'No Content' });

      expect(completed).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // moveTopic (reparent) — body key MUST be `parent_id`, not `new_parent_id`
  // -------------------------------------------------------------------------

  describe('moveTopic', () => {
    it('sends POST to /api/v1/topics/{id}/move with a { parent_id } body', () => {
      const request: MoveTopicRequest = { parent_id: 'topic-parent' };

      let result: TopicNodeDTO | undefined;
      service.moveTopic('topic-001', request).subscribe((r) => (result = r));

      const req = httpMock.expectOne(`${baseUrl}/api/v1/topics/topic-001/move`);
      expect(req.request.method).toBe('POST');
      // The backend reads the JSON key `parent_id` — verify the honest key.
      expect(req.request.body).toEqual({ parent_id: 'topic-parent' });

      req.flush(buildDto({ id: 'topic-001', parent_id: 'topic-parent' }));
      expect(result!.parent_id).toBe('topic-parent');
    });

    it('promotes to root with a null parent_id', () => {
      service.moveTopic('topic-001', { parent_id: null }).subscribe();

      const req = httpMock.expectOne(`${baseUrl}/api/v1/topics/topic-001/move`);
      expect(req.request.body).toEqual({ parent_id: null });
      req.flush(buildDto({ id: 'topic-001', parent_id: null }));
    });
  });

  // -------------------------------------------------------------------------
  // assignAtomToTopic (atom-centric attach)
  // -------------------------------------------------------------------------

  describe('assignAtomToTopic', () => {
    it('sends POST to /api/v1/topics/{topicId}/atoms with { atom_id }', () => {
      let completed = false;
      service.assignAtomToTopic('topic-001', 'atom-001').subscribe(() => (completed = true));

      const req = httpMock.expectOne(`${baseUrl}/api/v1/topics/topic-001/atoms`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ atom_id: 'atom-001' });

      req.flush({ status: 'attached', topic_id: 'topic-001', atom_id: 'atom-001' });

      expect(completed).toBe(true);
    });
  });

  // Sanity: keep an unused reference to buildNode so the tree-node builder is
  // covered by the type-checker (used by sibling specs).
  it('builds honest tree nodes without tenant_id', () => {
    const node = buildNode({ id: 'x' });
    expect('tenant_id' in node).toBe(false);
    expect(node.children).toEqual([]);
  });
});
