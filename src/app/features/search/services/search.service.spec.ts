import { TestBed } from '@angular/core/testing';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { SearchService } from './search.service';

describe('SearchService', () => {
  let service: SearchService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SearchService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // searchAtoms
  // ---------------------------------------------------------------------------

  describe('searchAtoms', () => {
    const mockResponse = {
      hits: [
        {
          id: 'atom-1',
          title: 'Photosynthesis Light Reactions',
          content_excerpt: 'In the light reactions of <em>photosynthesis</em>...',
          atom_type: 'multiple_choice',
          difficulty: 3,
          labels: ['biology'],
          topic_names: ['Biology'],
        },
      ],
      facets: {
        atom_type: { multiple_choice: 12, fill_blank: 5 },
        difficulty: { '3': 8, '4': 7 },
      },
      pagination: { total_hits: 1, limit: 20, offset: 0, estimated_total: 1 },
      processing_time_ms: 4,
      query: 'photosynthesis',
    };

    it('should set loading then success state', () => {
      service.searchAtoms('photosynthesis').subscribe();
      expect(service.atomSearchState().status).toBe('loading');

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/search/atoms'));
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('q')).toBe('photosynthesis');
      req.flush(mockResponse);

      expect(service.atomSearchState().status).toBe('success');
      expect(service.atomHits().length).toBe(1);
      expect(service.atomHits()[0].title).toBe('Photosynthesis Light Reactions');
    });

    it('should include filter params when provided', () => {
      const filters = { types: ['multiple_choice', 'fill_blank'], difficulties: [3 as const, 4 as const], topic: 'Biology' };
      service.searchAtoms('test', filters).subscribe();

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/search/atoms'));
      expect(req.request.params.get('type')).toBe('multiple_choice,fill_blank');
      expect(req.request.params.get('difficulty')).toBe('3,4');
      expect(req.request.params.get('topic')).toBe('Biology');
      req.flush(mockResponse);
    });

    it('should include sort param when not relevance', () => {
      service.searchAtoms('test', undefined, 'difficulty:asc').subscribe();

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/search/atoms'));
      expect(req.request.params.get('sort')).toBe('difficulty:asc');
      req.flush(mockResponse);
    });

    it('should not include sort param for relevance', () => {
      service.searchAtoms('test', undefined, 'relevance').subscribe();

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/search/atoms'));
      expect(req.request.params.has('sort')).toBe(false);
      req.flush(mockResponse);
    });

    it('should set error state on failure', () => {
      service.searchAtoms('test').subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/search/atoms'));
      req.flush('Error', { status: 500, statusText: 'Server Error' });
      expect(service.atomSearchState().status).toBe('error');
    });

    it('should expose facets via computed', () => {
      service.searchAtoms('photosynthesis').subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/search/atoms'));
      req.flush(mockResponse);

      expect(service.atomFacets()).toBeTruthy();
      expect(service.atomFacets()!.atom_type['multiple_choice']).toBe(12);
    });

    it('should expose pagination via computed', () => {
      service.searchAtoms('photosynthesis').subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/search/atoms'));
      req.flush(mockResponse);

      expect(service.atomPagination()).toBeTruthy();
      expect(service.atomPagination()!.total_hits).toBe(1);
    });

    it('should pass limit and offset params', () => {
      service.searchAtoms('test', undefined, undefined, 10, 20).subscribe();

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/search/atoms'));
      expect(req.request.params.get('limit')).toBe('10');
      expect(req.request.params.get('offset')).toBe('20');
      req.flush(mockResponse);
    });
  });

  // ---------------------------------------------------------------------------
  // searchTopics
  // ---------------------------------------------------------------------------

  describe('searchTopics', () => {
    const mockResponse = {
      hits: [
        { id: 'topic-1', name: 'Differential Calculus', description: 'Study of rates', path: 'Mathematics > Calculus', atom_count: 42 },
      ],
      pagination: { total_hits: 1, limit: 20, offset: 0, estimated_total: 1 },
      processing_time_ms: 2,
      query: 'calculus',
    };

    it('should set loading then success state', () => {
      service.searchTopics('calculus').subscribe();
      expect(service.topicSearchState().status).toBe('loading');

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/search/topics'));
      expect(req.request.method).toBe('GET');
      req.flush(mockResponse);

      expect(service.topicSearchState().status).toBe('success');
      expect(service.topicHits().length).toBe(1);
    });

    it('should set error state on failure', () => {
      service.searchTopics('test').subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/search/topics'));
      req.flush('Error', { status: 500, statusText: 'Server Error' });
      expect(service.topicSearchState().status).toBe('error');
    });
  });

  // ---------------------------------------------------------------------------
  // searchPaths
  // ---------------------------------------------------------------------------

  describe('searchPaths', () => {
    const mockResponse = {
      hits: [
        { id: 'path-1', title: 'Biology Fundamentals', description: 'Master biology', topic_names: ['Biology'], total_steps: 24, enrollment_count: 156 },
      ],
      pagination: { total_hits: 1, limit: 20, offset: 0, estimated_total: 1 },
      processing_time_ms: 3,
      query: 'biology',
    };

    it('should set loading then success state', () => {
      service.searchPaths('biology').subscribe();
      expect(service.pathSearchState().status).toBe('loading');

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/search/paths'));
      expect(req.request.method).toBe('GET');
      req.flush(mockResponse);

      expect(service.pathSearchState().status).toBe('success');
      expect(service.pathHits().length).toBe(1);
    });

    it('should include topic filter when provided', () => {
      service.searchPaths('biology', 'Biology').subscribe();

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/search/paths'));
      expect(req.request.params.get('topic')).toBe('Biology');
      req.flush(mockResponse);
    });

    it('should set error state on failure', () => {
      service.searchPaths('test').subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/search/paths'));
      req.flush('Error', { status: 500, statusText: 'Server Error' });
      expect(service.pathSearchState().status).toBe('error');
    });
  });

  // ---------------------------------------------------------------------------
  // isLoading
  // ---------------------------------------------------------------------------

  describe('isLoading', () => {
    it('should be true when any search is loading', () => {
      expect(service.isLoading()).toBe(false);

      service.searchAtoms('test').subscribe();
      expect(service.isLoading()).toBe(true);

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/search/atoms'));
      req.flush({
        hits: [],
        facets: { atom_type: {}, difficulty: {} },
        pagination: { total_hits: 0, limit: 20, offset: 0 },
        processing_time_ms: 1,
        query: 'test',
      });
      expect(service.isLoading()).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // resetState
  // ---------------------------------------------------------------------------

  describe('resetState', () => {
    it('should reset all states to idle', () => {
      service.searchAtoms('test').subscribe();
      httpMock.expectOne(r => r.url.includes('/api/v1/search/atoms')).flush({
        hits: [],
        facets: { atom_type: {}, difficulty: {} },
        pagination: { total_hits: 0, limit: 20, offset: 0 },
        processing_time_ms: 1,
        query: 'test',
      });

      service.resetState();

      expect(service.atomSearchState().status).toBe('idle');
      expect(service.topicSearchState().status).toBe('idle');
      expect(service.pathSearchState().status).toBe('idle');
    });
  });

  // ---------------------------------------------------------------------------
  // buildActiveFilters
  // ---------------------------------------------------------------------------

  describe('buildActiveFilters', () => {
    it('should construct ActiveFilters object', () => {
      const result = service.buildActiveFilters(['multiple_choice'], [3], 'Biology');
      expect(result).toEqual({ types: ['multiple_choice'], difficulties: [3], topic: 'Biology' });
    });
  });

  // ---------------------------------------------------------------------------
  // computed defaults
  // ---------------------------------------------------------------------------

  describe('computed defaults', () => {
    it('should return empty arrays and null when idle', () => {
      expect(service.atomHits()).toEqual([]);
      expect(service.atomFacets()).toBeNull();
      expect(service.atomPagination()).toBeNull();
      expect(service.topicHits()).toEqual([]);
      expect(service.topicPagination()).toBeNull();
      expect(service.pathHits()).toEqual([]);
      expect(service.pathPagination()).toBeNull();
    });
  });
});
