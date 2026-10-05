import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TopicService } from './topic.service';
import { environment } from '../../../../environments/environment';
import type { TopicNode, TopicNodeDTO } from '../models/atom.models';

/**
 * Wire DTO builder — mirrors EXACTLY what GET /api/v1/topics returns per node
 * (chora-creation topic_handler.go): flat, NO `tenant_id`, NO `children`.
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

/** Client tree-node builder (a DTO plus assembled `children`). */
function buildNode(overrides: Partial<TopicNode> = {}): TopicNode {
  return { ...buildDto(), children: [], ...overrides };
}

describe('TopicService', () => {
  let service: TopicService;
  let httpMock: HttpTestingController;
  const baseUrl = environment.bffBaseUrl;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        TopicService,
      ],
    });
    service = TestBed.inject(TopicService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------

  it('starts with idle tree state', () => {
    expect(service.treeState()).toEqual({ status: 'idle' });
  });

  it('starts with empty topics', () => {
    expect(service.topics()).toEqual([]);
  });

  it('starts with null selected topic', () => {
    expect(service.selectedTopic()).toBeNull();
  });

  // -------------------------------------------------------------------------
  // loadTopicTree (REST — GET /api/v1/topics -> { data: TopicNodeDTO[] })
  // -------------------------------------------------------------------------

  describe('loadTopicTree', () => {
    it('loads topic tree without rootId', () => {
      service.loadTopicTree().subscribe();

      const req = httpMock.expectOne(`${baseUrl}/api/v1/topics`);
      expect(req.request.method).toBe('GET');

      req.flush({
        data: [
          buildDto({ id: 'topic-001', name: 'Mathematics' }),
          buildDto({ id: 'topic-002', name: 'Science' }),
        ],
      });

      expect(service.treeState().status).toBe('success');
      expect(service.topics()).toHaveLength(2);
      expect(service.topics()[0].name).toBe('Mathematics');
      expect(service.topics()[1].name).toBe('Science');
    });

    it('passes rootId as parent_id query param when provided', () => {
      service.loadTopicTree('topic-001').subscribe();

      const req = httpMock.expectOne(`${baseUrl}/api/v1/topics?parent_id=topic-001`);
      expect(req.request.method).toBe('GET');

      req.flush({ data: [buildDto()] });
    });

    it('builds a nested tree structure from the flat wire list', () => {
      service.loadTopicTree().subscribe();

      const req = httpMock.expectOne(`${baseUrl}/api/v1/topics`);
      req.flush({
        data: [
          buildDto({ id: 'root', name: 'Root', parent_id: null }),
          buildDto({ id: 'child-1', name: 'Algebra', parent_id: 'root' }),
          buildDto({ id: 'grandchild-1', name: 'Linear Equations', parent_id: 'child-1' }),
        ],
      });

      const topics = service.topics();
      expect(topics).toHaveLength(1);
      expect(topics[0].id).toBe('root');
      expect(topics[0].children).toHaveLength(1);
      expect(topics[0].children[0].name).toBe('Algebra');
      expect(topics[0].children[0].children).toHaveLength(1);
      expect(topics[0].children[0].children[0].name).toBe('Linear Equations');
    });

    it('mirrors the flat wire DTO honestly (snake_case, no tenant_id)', () => {
      service.loadTopicTree().subscribe();

      const req = httpMock.expectOne(`${baseUrl}/api/v1/topics`);
      req.flush({ data: [buildDto()] });

      const topic = service.topics()[0];
      expect(topic.parent_id).toBeNull();
      expect(topic.sort_order).toBe(0);
      expect(topic.created_at).toBe('2026-01-01T00:00:00Z');
      expect(topic.updated_at).toBe('2026-01-02T00:00:00Z');
      // tenant_id is deliberately NOT on the wire — the model must not carry it.
      expect('tenant_id' in topic).toBe(false);
    });

    it('sets loading state before response', () => {
      service.loadTopicTree().subscribe();
      expect(service.treeState().status).toBe('loading');

      const req = httpMock.expectOne(`${baseUrl}/api/v1/topics`);
      req.flush({ data: [] });
    });

    it('handles empty topic tree', () => {
      service.loadTopicTree().subscribe();

      const req = httpMock.expectOne(`${baseUrl}/api/v1/topics`);
      req.flush({ data: [] });

      expect(service.topics()).toEqual([]);
    });

    it('sets error state on network error', () => {
      service.loadTopicTree().subscribe();

      const req = httpMock.expectOne(`${baseUrl}/api/v1/topics`);
      req.error(new ProgressEvent('error'));

      expect(service.treeState().status).toBe('error');
    });

    it('coalesces missing data field to empty array (res.data ?? [])', () => {
      service.loadTopicTree().subscribe();

      const req = httpMock.expectOne(`${baseUrl}/api/v1/topics`);
      req.flush({});

      expect(service.treeState().status).toBe('success');
      expect(service.topics()).toEqual([]);
    });

    it('treats a node with an unknown parent_id as a root (map.has false arm)', () => {
      service.loadTopicTree().subscribe();

      const req = httpMock.expectOne(`${baseUrl}/api/v1/topics`);
      req.flush({
        data: [buildDto({ id: 'orphan', name: 'Orphan', parent_id: 'missing-parent' })],
      });

      const topics = service.topics();
      expect(topics).toHaveLength(1);
      expect(topics[0].id).toBe('orphan');
      expect(topics[0].children).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // loadTopicNode (REST — GET /api/v1/topics/{id} -> flat TopicNodeDTO)
  // -------------------------------------------------------------------------

  describe('loadTopicNode', () => {
    it('loads a single topic node and materialises empty children', () => {
      let result: TopicNode | null = null;
      service.loadTopicNode('topic-001').subscribe((t) => (result = t));

      const req = httpMock.expectOne(`${baseUrl}/api/v1/topics/topic-001`);
      expect(req.request.method).toBe('GET');

      // The single-node endpoint returns a FLAT DTO — no `children` on the wire.
      req.flush(buildDto({ id: 'topic-001', name: 'Mathematics' }));

      expect(result).toBeTruthy();
      expect(result!.id).toBe('topic-001');
      // The service must materialise a tree node with an empty children array,
      // never leave `children` undefined (would break tree consumers).
      expect(result!.children).toEqual([]);
      expect(service.selectedTopic()).toBeTruthy();
      expect(service.selectedTopic()!.id).toBe('topic-001');
      expect(service.selectedTopic()!.children).toEqual([]);
    });

    it('returns null on error', () => {
      let result: TopicNode | null = 'unset' as unknown as TopicNode | null;
      service.loadTopicNode('topic-001').subscribe((t) => (result = t));

      const req = httpMock.expectOne(`${baseUrl}/api/v1/topics/topic-001`);
      req.error(new ProgressEvent('error'));

      expect(result).toBeNull();
    });

    it('does not set selection when the response body is falsy', () => {
      let result: TopicNode | null = 'unset' as unknown as TopicNode | null;
      service.loadTopicNode('topic-001').subscribe((t) => (result = t));

      const req = httpMock.expectOne(`${baseUrl}/api/v1/topics/topic-001`);
      expect(req.request.method).toBe('GET');
      req.flush(null);

      expect(result).toBeNull();
      expect(service.selectedTopic()).toBeNull();
    });

    it('url-encodes the id segment', () => {
      service.loadTopicNode('a/b c').subscribe();

      const req = httpMock.expectOne(`${baseUrl}/api/v1/topics/a%2Fb%20c`);
      expect(req.request.method).toBe('GET');
      req.flush(buildDto({ id: 'a/b c' }));
    });
  });

  // -------------------------------------------------------------------------
  // selectTopic
  // -------------------------------------------------------------------------

  describe('selectTopic', () => {
    it('sets selected topic', () => {
      const topic = buildNode({ id: 'topic-001', name: 'Math' });
      service.selectTopic(topic);
      expect(service.selectedTopic()).toEqual(topic);
    });

    it('clears selected topic with null', () => {
      service.selectTopic(null);
      expect(service.selectedTopic()).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // findTopicById
  // -------------------------------------------------------------------------

  describe('findTopicById', () => {
    const tree: TopicNode[] = [
      buildNode({
        id: 'root',
        name: 'Root',
        children: [
          buildNode({
            id: 'child-1',
            name: 'Child 1',
            parent_id: 'root',
            children: [
              buildNode({ id: 'grandchild-1', name: 'Grandchild 1', parent_id: 'child-1' }),
            ],
          }),
        ],
      }),
    ];

    it('finds root-level topic', () => {
      expect(service.findTopicById('root', tree)?.name).toBe('Root');
    });

    it('finds nested topic', () => {
      expect(service.findTopicById('child-1', tree)?.name).toBe('Child 1');
    });

    it('finds deeply nested topic', () => {
      expect(service.findTopicById('grandchild-1', tree)?.name).toBe('Grandchild 1');
    });

    it('returns null for non-existent id', () => {
      expect(service.findTopicById('not-found', tree)).toBeNull();
    });

    it('defaults to the loaded topics() signal when nodes arg omitted', () => {
      service.loadTopicTree().subscribe();
      const req = httpMock.expectOne(`${baseUrl}/api/v1/topics`);
      req.flush({
        data: [
          buildDto({ id: 'root', name: 'Root', parent_id: null }),
          buildDto({ id: 'child-x', name: 'Child X', parent_id: 'root' }),
        ],
      });

      expect(service.findTopicById('child-x')?.name).toBe('Child X');
      expect(service.findTopicById('nope')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // flattenTopics
  // -------------------------------------------------------------------------

  describe('flattenTopics', () => {
    it('flattens nested topic tree', () => {
      const tree: TopicNode[] = [
        buildNode({
          id: 'root',
          name: 'Root',
          children: [buildNode({ id: 'child-1', name: 'Child', parent_id: 'root' })],
        }),
      ];

      const flat = service.flattenTopics(tree);
      expect(flat).toHaveLength(2);
      expect(flat[0].id).toBe('root');
      expect(flat[1].id).toBe('child-1');
    });

    it('returns empty array for empty tree', () => {
      expect(service.flattenTopics([])).toEqual([]);
    });

    it('defaults to the loaded topics() signal when nodes arg omitted', () => {
      service.loadTopicTree().subscribe();
      const req = httpMock.expectOne(`${baseUrl}/api/v1/topics`);
      req.flush({
        data: [
          buildDto({ id: 'root', name: 'Root', parent_id: null }),
          buildDto({ id: 'child-y', name: 'Child Y', parent_id: 'root' }),
        ],
      });

      const flat = service.flattenTopics();
      expect(flat.map((n) => n.id)).toEqual(['root', 'child-y']);
    });

    it('returns empty array when topics() signal is empty (default arg + empty loop)', () => {
      expect(service.flattenTopics()).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // State reset
  // -------------------------------------------------------------------------

  describe('state reset', () => {
    it('resetTreeState returns to idle', () => {
      service.loadTopicTree().subscribe();
      const req = httpMock.expectOne(`${baseUrl}/api/v1/topics`);
      req.flush({ data: [buildDto()] });

      expect(service.treeState().status).toBe('success');
      service.resetTreeState();
      expect(service.treeState()).toEqual({ status: 'idle' });
    });

    it('resetSelection clears selected topic', () => {
      service.selectTopic(buildNode({ id: 't', name: 'T' }));
      expect(service.selectedTopic()).toBeTruthy();

      service.resetSelection();
      expect(service.selectedTopic()).toBeNull();
    });
  });
});
