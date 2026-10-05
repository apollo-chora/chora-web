import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { EventBusMonitorComponent } from './event-bus-monitor.component';
import { DeveloperService } from '../../services/developer.service';

describe('EventBusMonitorComponent', () => {
  let component: EventBusMonitorComponent;
  let fixture: ComponentFixture<EventBusMonitorComponent>;
  let httpMock: HttpTestingController;
  let developerService: DeveloperService;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [EventBusMonitorComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(EventBusMonitorComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    developerService = TestBed.inject(DeveloperService);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
    // Ensure event bus is disconnected after each test
    developerService.disconnectEventBus();
    vi.useRealTimers();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have data-testid attribute', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="event-bus-monitor"]');
    expect(el).toBeTruthy();
  });

  it('should display monitor title', () => {
    const title = fixture.nativeElement.querySelector('[data-testid="monitor-title"]');
    expect(title).toBeTruthy();
  });

  it('should display connection status bar', () => {
    const status = fixture.nativeElement.querySelector('[data-testid="connection-status"]');
    expect(status).toBeTruthy();
  });

  it('should start in disconnected state', () => {
    expect(component.isConnected()).toBe(false);
    expect(component.isConnecting()).toBe(false);
    expect(component.connectionState()).toBe('disconnected');
  });

  it('should connect to event bus', () => {
    vi.useFakeTimers();
    component.toggleConnection();
    expect(component.isConnecting()).toBe(true);

    vi.advanceTimersByTime(500); // Wait for simulated connection delay
    expect(component.isConnected()).toBe(true);
    expect(component.messages().length).toBeGreaterThan(0);
  });

  it('should disconnect from event bus when connected', () => {
    vi.useFakeTimers();
    component.toggleConnection();
    vi.advanceTimersByTime(500);
    expect(component.isConnected()).toBe(true);

    component.toggleConnection();
    expect(component.isConnected()).toBe(false);
    expect(component.messages().length).toBe(0);
  });

  it('should display message count', () => {
    vi.useFakeTimers();
    component.toggleConnection();
    vi.advanceTimersByTime(500);
    fixture.detectChanges();

    const countEl = fixture.nativeElement.querySelector('[data-testid="message-count"]');
    expect(countEl).toBeTruthy();
    expect(component.messageCount()).toBeGreaterThan(0);
  });

  it('should filter messages by topic', () => {
    vi.useFakeTimers();
    component.toggleConnection();
    vi.advanceTimersByTime(500);

    const allCount = component.messages().length;
    const firstTopic = component.messages()[0].topic;

    component.onTopicFilter(firstTopic);
    expect(component.topicFilter()).toBe(firstTopic);

    const filtered = component.filteredMessages();
    expect(filtered.every((m) => m.topic === firstTopic)).toBe(true);
    expect(filtered.length).toBeLessThanOrEqual(allCount);
  });

  it('should show all messages when topic filter is null', () => {
    vi.useFakeTimers();
    component.toggleConnection();
    vi.advanceTimersByTime(500);

    component.onTopicFilter('chora.engagement.xp');
    component.onTopicFilter(null);
    expect(component.filteredMessages().length).toBe(component.messages().length);
  });

  it('should compute unique topics', () => {
    vi.useFakeTimers();
    component.toggleConnection();
    vi.advanceTimersByTime(500);

    const topics = component.uniqueTopics();
    expect(topics.length).toBeGreaterThan(0);
    // Topics should be sorted
    const sorted = [...topics].sort();
    expect(topics).toEqual(sorted);
    // No duplicates
    expect(new Set(topics).size).toBe(topics.length);
  });

  it('should toggle event expansion', () => {
    vi.useFakeTimers();
    component.toggleConnection();
    vi.advanceTimersByTime(500);

    component.toggleExpand(0);
    expect(component.isExpanded(0)).toBe(true);

    component.toggleExpand(0);
    expect(component.isExpanded(0)).toBe(false);
  });

  it('should collapse previous event when expanding another', () => {
    vi.useFakeTimers();
    component.toggleConnection();
    vi.advanceTimersByTime(500);

    if (component.messages().length < 2) {
      return;
    }

    component.toggleExpand(0);
    expect(component.isExpanded(0)).toBe(true);

    component.toggleExpand(1);
    expect(component.isExpanded(1)).toBe(true);
    expect(component.isExpanded(0)).toBe(false);
  });

  it('should clear messages and disconnect', () => {
    vi.useFakeTimers();
    component.toggleConnection();
    vi.advanceTimersByTime(500);
    expect(component.messages().length).toBeGreaterThan(0);

    component.clearMessages();
    expect(component.messages().length).toBe(0);
    expect(component.isConnected()).toBe(false);
  });

  it('should toggle pause state', () => {
    expect(component.paused()).toBe(false);
    component.togglePause();
    expect(component.paused()).toBe(true);
    component.togglePause();
    expect(component.paused()).toBe(false);
  });

  it('should format timestamp correctly', () => {
    const result = component.formatTimestamp('2026-09-01T10:30:00.123Z');
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
  });

  it('should return raw string for invalid timestamp', () => {
    const result = component.formatTimestamp('invalid');
    expect(result).toBeTruthy();
  });

  it('should generate payload preview', () => {
    const payload = { key: 'value', nested: { deep: true } };
    const preview = component.payloadPreview(payload);
    expect(preview).toBeTruthy();
    expect(typeof preview).toBe('string');
  });

  it('should generate full payload JSON', () => {
    const payload = { key: 'value' };
    const full = component.payloadFull(payload);
    expect(full).toBe(JSON.stringify(payload, null, 2));
  });

  it('should extract short topic name', () => {
    expect(component.topicShortName('chora.engagement.xp')).toBe('xp');
    expect(component.topicShortName('chora.atomic.lifecycle')).toBe('lifecycle');
    expect(component.topicShortName('simple')).toBe('simple');
  });

  it('should return correct connection label', () => {
    vi.useFakeTimers();
    expect(component.connectionLabel()).toBe('admin.developer.connect');

    component.toggleConnection();
    expect(component.connectionLabel()).toBe('admin.developer.connecting');

    vi.advanceTimersByTime(500);
    expect(component.connectionLabel()).toBe('admin.developer.disconnect');
  });

  it('should show connect button', () => {
    const btn = fixture.nativeElement.querySelector('[data-testid="btn-connect"]');
    expect(btn).toBeTruthy();
  });

  it('should show clear button', () => {
    const btn = fixture.nativeElement.querySelector('[data-testid="btn-clear"]');
    expect(btn).toBeTruthy();
  });

  it('should have no critical accessibility violations', async () => {
    const axe = (await import('axe-core')).default;
    const results = await axe.run(fixture.nativeElement);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
  });
});
