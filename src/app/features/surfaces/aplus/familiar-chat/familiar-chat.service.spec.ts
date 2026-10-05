import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { firstValueFrom, toArray, take } from 'rxjs';

import { FamiliarChatService } from './familiar-chat.service';
import { AuthService } from '../../../../core/auth/auth.service';
import type { ChatEvent, ChatStreamError } from './familiar-chat.model';

/**
 * SSE-over-POST service spec — uses a fake `fetch` returning a
 * ReadableStream so we can exercise the parser deterministically.
 */

class StubAuth {
  getToken(): string | null {
    return 'eyJfake.token';
  }
}

function makeStream(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(ctrl) {
      if (i >= chunks.length) {
        ctrl.close();
        return;
      }
      ctrl.enqueue(enc.encode(chunks[i++]));
    },
  });
}

function makeResponse(opts: {
  status: number;
  headers?: Record<string, string>;
  bodyChunks?: string[];
  jsonBody?: unknown;
}): Response {
  if (opts.jsonBody !== undefined) {
    return new Response(JSON.stringify(opts.jsonBody), {
      status: opts.status,
      headers: { 'content-type': 'application/json', ...(opts.headers ?? {}) },
    });
  }
  return new Response(makeStream(opts.bodyChunks ?? []), {
    status: opts.status,
    headers: {
      'content-type': 'text/event-stream',
      ...(opts.headers ?? {}),
    },
  });
}

describe('FamiliarChatService (Phase J.1 — SSE-over-POST)', () => {
  let service: FamiliarChatService;
  let fetchSpy: ReturnType<typeof vi.fn>;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        FamiliarChatService,
        { provide: AuthService, useClass: StubAuth },
      ],
    });
    service = TestBed.inject(FamiliarChatService);
    originalFetch = globalThis.fetch;
    fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('happy-path SSE stream', () => {
    it('emits each frame in order: session_open → tool_call → token×N → turn_complete', async () => {
      fetchSpy.mockResolvedValueOnce(
        makeResponse({
          status: 200,
          bodyChunks: [
            'event: session_open\ndata: {"session_id":"s1","turn_id":"t1","engine_session_id":"e1"}\n\n',
            'event: tool_call\ndata: {"tool":"atom_search","args":{"query":"forgetting"}}\n\n',
            'event: token\ndata: {"text":"Based on"}\n\n',
            'event: token\ndata: {"text":" your history,"}\n\n',
            'event: turn_complete\ndata: {"session_id":"s1","turn_id":"t1","output_tokens":12,"mana_charged":5,"model":"gemini-2.5-flash-lite","finish_reason":"STOP"}\n\n',
          ],
        }),
      );

      const events = await firstValueFrom(
        service.streamChat('f-1', { message: 'hi' }).pipe(toArray()),
      );
      const types = (events as ChatEvent[]).map((e) => e.type);
      expect(types).toEqual([
        'session_open',
        'tool_call',
        'token',
        'token',
        'turn_complete',
      ]);
      expect((events[0] as { session_id: string }).session_id).toBe('s1');
      expect((events[1] as { tool: string }).tool).toBe('atom_search');
      expect((events[2] as { text: string }).text).toBe('Based on');
      expect((events[4] as { mana_charged: number }).mana_charged).toBe(5);
    });

    it('handles frames split across multiple chunks', async () => {
      fetchSpy.mockResolvedValueOnce(
        makeResponse({
          status: 200,
          bodyChunks: [
            'event: session_open\n',
            'data: {"session_id":"s1","turn_id":"t1","engine_session_id":"e1"}\n\n',
            'event: token\ndata: {"text":"ok"}\n\n',
          ],
        }),
      );

      const events = await firstValueFrom(
        service.streamChat('f-1', { message: 'hi' }).pipe(toArray()),
      );
      expect(events).toHaveLength(2);
      expect((events[0] as { type: string }).type).toBe('session_open');
      expect((events[1] as { type: string }).type).toBe('token');
    });

    it('handles multiple frames in a single chunk', async () => {
      fetchSpy.mockResolvedValueOnce(
        makeResponse({
          status: 200,
          bodyChunks: [
            'event: token\ndata: {"text":"a"}\n\nevent: token\ndata: {"text":"b"}\n\nevent: turn_complete\ndata: {"session_id":"s","turn_id":"t","output_tokens":2,"mana_charged":5,"model":"m"}\n\n',
          ],
        }),
      );

      const events = await firstValueFrom(
        service.streamChat('f-1', { message: 'hi' }).pipe(toArray()),
      );
      expect(events).toHaveLength(3);
    });

    it('ignores empty frames + comment lines', async () => {
      fetchSpy.mockResolvedValueOnce(
        makeResponse({
          status: 200,
          bodyChunks: [
            ': heartbeat\n\nevent: token\ndata: {"text":"x"}\n\n\n\n',
          ],
        }),
      );

      const events = await firstValueFrom(
        service.streamChat('f-1', { message: 'hi' }).pipe(toArray()),
      );
      expect(events).toHaveLength(1);
      expect((events[0] as { type: string }).type).toBe('token');
    });
  });

  describe('error frames', () => {
    it('forwards an error frame as a normal next emission (component-side dispatch)', async () => {
      fetchSpy.mockResolvedValueOnce(
        makeResponse({
          status: 200,
          bodyChunks: [
            'event: session_open\ndata: {"session_id":"s","turn_id":"t","engine_session_id":"e"}\n\n',
            'event: error\ndata: {"code":"GUARDRAIL_BLOCKED","message":"Output blocked by Cloud Model Armor"}\n\n',
          ],
        }),
      );

      const events = await firstValueFrom(
        service.streamChat('f-1', { message: 'hi' }).pipe(toArray()),
      );
      expect(events).toHaveLength(2);
      const err = events[1] as { type: string; code: string };
      expect(err.type).toBe('error');
      expect(err.code).toBe('GUARDRAIL_BLOCKED');
    });
  });

  describe('402 insufficient_mana', () => {
    it('emits Observable error with kind=insufficient_mana + upsell envelope', async () => {
      fetchSpy.mockResolvedValueOnce(
        makeResponse({
          status: 402,
          jsonBody: {
            error: {
              code: 'insufficient_mana',
              message: 'You need 5 mana',
              upsell: {
                required_units: 5,
                current_balance_units: 0,
                recommended_plan_code: 'basic',
                recommended_topup_units: 100,
              },
            },
          },
        }),
      );

      try {
        await firstValueFrom(
          service.streamChat('f-1', { message: 'hi' }).pipe(toArray()),
        );
        expect.fail('expected error');
      } catch (e) {
        const err = e as ChatStreamError;
        expect(err.kind).toBe('insufficient_mana');
        if (err.kind === 'insufficient_mana') {
          expect(err.upsell.required_units).toBe(5);
          expect(err.upsell.current_balance_units).toBe(0);
        }
      }
    });
  });

  describe('5xx / transport errors', () => {
    it('emits Observable error with kind=transport on 503', async () => {
      fetchSpy.mockResolvedValueOnce(
        makeResponse({
          status: 503,
          jsonBody: {
            error: {
              code: 'ENGINE_NOT_CONFIGURED',
              message: 'FAMILIAR_ENGINE_RESOURCE unset',
            },
          },
        }),
      );

      try {
        await firstValueFrom(service.streamChat('f-1', { message: 'hi' }));
        expect.fail('expected error');
      } catch (e) {
        const err = e as ChatStreamError;
        expect(err.kind).toBe('transport');
        if (err.kind === 'transport') {
          expect(err.status).toBe(503);
          expect(err.code).toBe('ENGINE_NOT_CONFIGURED');
        }
      }
    });

    it('emits Observable error with kind=transport on 502 GATEWAY_UPSTREAM_5XX', async () => {
      fetchSpy.mockResolvedValueOnce(
        makeResponse({
          status: 502,
          jsonBody: { error: { code: 'GATEWAY_UPSTREAM_5XX', message: 'upstream 5xx' } },
        }),
      );
      try {
        await firstValueFrom(service.streamChat('f-1', { message: 'hi' }));
        expect.fail('expected error');
      } catch (e) {
        const err = e as ChatStreamError;
        expect(err.kind).toBe('transport');
      }
    });
  });

  describe('request shape + auth', () => {
    it('POSTs to /api/v1/me/familiars/{id}/chat with Bearer token + json body', async () => {
      fetchSpy.mockResolvedValueOnce(makeResponse({ status: 200, bodyChunks: [] }));

      await firstValueFrom(
        service
          .streamChat('f-abc', { message: 'hi', locale: 'en' })
          .pipe(toArray()),
      );

      expect(fetchSpy).toHaveBeenCalledOnce();
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/api/v1/me/familiars/f-abc/chat');
      expect(init.method).toBe('POST');
      const headers = init.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer eyJfake.token');
      expect(headers['Accept']).toContain('event-stream');
      expect(headers['Content-Type']).toContain('application/json');
      expect(JSON.parse(init.body as string)).toEqual({
        message: 'hi',
        locale: 'en',
      });
    });
  });

  describe('subscription teardown', () => {
    it('aborts the underlying fetch when the subscriber unsubscribes', async () => {
      const abortSpy = vi.fn();
      // Hold the stream open — only emit on demand so the consumer can
      // unsubscribe mid-flight.
      let resolveCtrl!: (c: ReadableStreamDefaultController<Uint8Array>) => void;
      const pendingCtrl = new Promise<ReadableStreamDefaultController<Uint8Array>>(
        (r) => (resolveCtrl = r),
      );
      const enc = new TextEncoder();
      const body = new ReadableStream<Uint8Array>({
        start(ctrl) {
          ctrl.enqueue(enc.encode('event: token\ndata: {"text":"a"}\n\n'));
          resolveCtrl(ctrl);
        },
      });

      fetchSpy.mockImplementationOnce(async (_url: string, init: RequestInit) => {
        (init.signal as AbortSignal).addEventListener('abort', () => abortSpy());
        return new Response(body, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      });

      const sub = service.streamChat('f-1', { message: 'hi' }).pipe(take(1)).subscribe();
      // wait one microtask so the stream pump emits the first frame
      await pendingCtrl;
      // take(1) auto-unsubscribes after the first emission
      await new Promise((r) => setTimeout(r, 20));
      sub.unsubscribe();
      expect(abortSpy).toHaveBeenCalled();
    });
  });

  describe('malformed frames (fail-loud)', () => {
    it('emits an INTERNAL_ERROR error frame when data is not valid JSON', async () => {
      fetchSpy.mockResolvedValueOnce(
        makeResponse({
          status: 200,
          bodyChunks: ['event: token\ndata: {not-json}\n\n'],
        }),
      );

      const events = await firstValueFrom(
        service.streamChat('f-1', { message: 'hi' }).pipe(toArray()),
      );
      expect(events).toHaveLength(1);
      const err = events[0] as { type: string; code: string; message: string };
      expect(err.type).toBe('error');
      expect(err.code).toBe('INTERNAL_ERROR');
      expect(err.message).toContain('Malformed SSE frame');
      expect(err.message).toContain('{not-json}');
    });

    it('drops a frame that has an event line but no data line', async () => {
      fetchSpy.mockResolvedValueOnce(
        makeResponse({
          status: 200,
          bodyChunks: [
            'event: token\n\n',
            'event: token\ndata: {"text":"kept"}\n\n',
          ],
        }),
      );

      const events = await firstValueFrom(
        service.streamChat('f-1', { message: 'hi' }).pipe(toArray()),
      );
      expect(events).toHaveLength(1);
      expect((events[0] as { text: string }).text).toBe('kept');
    });

    it('drops a frame that has a data line but no event line', async () => {
      fetchSpy.mockResolvedValueOnce(
        makeResponse({
          status: 200,
          bodyChunks: [
            'data: {"text":"orphan"}\n\n',
            'event: token\ndata: {"text":"kept"}\n\n',
          ],
        }),
      );

      const events = await firstValueFrom(
        service.streamChat('f-1', { message: 'hi' }).pipe(toArray()),
      );
      expect(events).toHaveLength(1);
      expect((events[0] as { text: string }).text).toBe('kept');
    });
  });

  describe('trailing frame flush (no terminating blank line)', () => {
    it('emits a final complete frame that is not terminated by \\n\\n', async () => {
      fetchSpy.mockResolvedValueOnce(
        makeResponse({
          status: 200,
          bodyChunks: [
            'event: token\ndata: {"text":"first"}\n\n',
            // no trailing blank line — must be flushed at stream close
            'event: turn_complete\ndata: {"session_id":"s","turn_id":"t","output_tokens":1,"mana_charged":5,"model":"m"}',
          ],
        }),
      );

      const events = await firstValueFrom(
        service.streamChat('f-1', { message: 'hi' }).pipe(toArray()),
      );
      expect(events).toHaveLength(2);
      expect((events[0] as { type: string }).type).toBe('token');
      expect((events[1] as { type: string }).type).toBe('turn_complete');
    });

    it('completes cleanly with no events on an entirely empty stream', async () => {
      fetchSpy.mockResolvedValueOnce(
        makeResponse({ status: 200, bodyChunks: [] }),
      );

      const events = await firstValueFrom(
        service.streamChat('f-1', { message: 'hi' }).pipe(toArray()),
      );
      expect(events).toEqual([]);
    });
  });

  describe('402 fall-through (no upsell envelope)', () => {
    it('falls back to a transport error when the 402 body has no upsell', async () => {
      fetchSpy.mockResolvedValueOnce(
        makeResponse({
          status: 402,
          jsonBody: { error: { code: 'insufficient_mana', message: 'nope' } },
        }),
      );

      try {
        await firstValueFrom(service.streamChat('f-1', { message: 'hi' }));
        expect.fail('expected error');
      } catch (e) {
        const err = e as ChatStreamError;
        expect(err.kind).toBe('transport');
        if (err.kind === 'transport') {
          expect(err.status).toBe(402);
          expect(err.code).toBe('insufficient_mana');
          expect(err.message).toBe('Insufficient mana');
        }
      }
    });

    it('falls back to a transport error when the 402 body is not JSON', async () => {
      // Non-JSON body forces the .json() parse to throw inside parse402.
      fetchSpy.mockResolvedValueOnce(
        new Response('not json at all', {
          status: 402,
          headers: { 'content-type': 'text/plain' },
        }),
      );

      try {
        await firstValueFrom(service.streamChat('f-1', { message: 'hi' }));
        expect.fail('expected error');
      } catch (e) {
        const err = e as ChatStreamError;
        expect(err.kind).toBe('transport');
        if (err.kind === 'transport') {
          expect(err.status).toBe(402);
          expect(err.code).toBe('insufficient_mana');
          expect(err.message).toBe('Insufficient mana');
        }
      }
    });
  });

  describe('transport-error parsing defaults', () => {
    it('uses HTTP_{status} + statusText when the body has no error envelope', async () => {
      // 500 with a JSON body that has no `error` field.
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ unrelated: true }), {
          status: 500,
          statusText: 'Internal Server Error',
          headers: { 'content-type': 'application/json' },
        }),
      );

      try {
        await firstValueFrom(service.streamChat('f-1', { message: 'hi' }));
        expect.fail('expected error');
      } catch (e) {
        const err = e as ChatStreamError;
        expect(err.kind).toBe('transport');
        if (err.kind === 'transport') {
          expect(err.status).toBe(500);
          expect(err.code).toBe('HTTP_500');
          expect(err.message).toBe('Internal Server Error');
        }
      }
    });

    it('uses HTTP_{status} defaults when the error body is not JSON', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response('<html>gateway error</html>', {
          status: 504,
          statusText: 'Gateway Timeout',
          headers: { 'content-type': 'text/html' },
        }),
      );

      try {
        await firstValueFrom(service.streamChat('f-1', { message: 'hi' }));
        expect.fail('expected error');
      } catch (e) {
        const err = e as ChatStreamError;
        expect(err.kind).toBe('transport');
        if (err.kind === 'transport') {
          expect(err.status).toBe(504);
          expect(err.code).toBe('HTTP_504');
          expect(err.message).toBe('Gateway Timeout');
        }
      }
    });

    it('treats a 200 response with a null body as a transport error', async () => {
      // response.ok is true but response.body is null -> parseTransportError.
      fetchSpy.mockResolvedValueOnce(
        new Response(null, {
          status: 204,
          statusText: 'No Content',
          headers: {},
        }),
      );

      try {
        await firstValueFrom(service.streamChat('f-1', { message: 'hi' }));
        expect.fail('expected error');
      } catch (e) {
        const err = e as ChatStreamError;
        expect(err.kind).toBe('transport');
        if (err.kind === 'transport') {
          expect(err.status).toBe(204);
          expect(err.code).toBe('HTTP_204');
        }
      }
    });
  });

  describe('network-level fetch rejection', () => {
    it('surfaces a NETWORK_ERROR transport error when fetch() rejects', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('connection refused'));

      try {
        await firstValueFrom(service.streamChat('f-1', { message: 'hi' }));
        expect.fail('expected error');
      } catch (e) {
        const err = e as ChatStreamError;
        expect(err.kind).toBe('transport');
        if (err.kind === 'transport') {
          expect(err.status).toBe(0);
          expect(err.code).toBe('NETWORK_ERROR');
          expect(err.message).toBe('connection refused');
        }
      }
    });

    it('coerces a non-Error rejection value into a string message', async () => {
      fetchSpy.mockRejectedValueOnce('socket hang up');

      try {
        await firstValueFrom(service.streamChat('f-1', { message: 'hi' }));
        expect.fail('expected error');
      } catch (e) {
        const err = e as ChatStreamError;
        expect(err.kind).toBe('transport');
        if (err.kind === 'transport') {
          expect(err.code).toBe('NETWORK_ERROR');
          expect(err.message).toBe('socket hang up');
        }
      }
    });

    it('does NOT error when fetch rejects because the subscriber already aborted', async () => {
      const ctrlAbort = { aborted: false };
      fetchSpy.mockImplementationOnce((_url: string, init: RequestInit) => {
        // Simulate teardown happening before fetch settles, then reject.
        return new Promise((_resolve, reject) => {
          (init.signal as AbortSignal).addEventListener('abort', () => {
            ctrlAbort.aborted = true;
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      });

      const onError = vi.fn();
      const onComplete = vi.fn();
      const sub = service
        .streamChat('f-1', { message: 'hi' })
        .subscribe({ error: onError, complete: onComplete });

      // Tear down -> triggers ctrl.abort() -> fetch promise rejects while aborted.
      sub.unsubscribe();
      await new Promise((r) => setTimeout(r, 20));

      expect(ctrlAbort.aborted).toBe(true);
      expect(onError).not.toHaveBeenCalled();
      expect(onComplete).not.toHaveBeenCalled();
    });
  });

  describe('reader-level read failure', () => {
    it('surfaces a NETWORK_ERROR transport error when the stream read() throws', async () => {
      const failingBody: ReadableStream<Uint8Array> = {
        getReader() {
          return {
            read() {
              return Promise.reject(new Error('stream broke'));
            },
            releaseLock() {
              /* no-op */
            },
            cancel() {
              return Promise.resolve();
            },
          } as unknown as ReadableStreamDefaultReader<Uint8Array>;
        },
      } as unknown as ReadableStream<Uint8Array>;

      // Mock a Response-shaped object directly so `.body` is our failing
      // stream — the parser calls `.body.getReader().read()` which rejects.
      fetchSpy.mockResolvedValueOnce({
        status: 200,
        ok: true,
        body: failingBody,
        statusText: 'OK',
        json: async () => ({}),
      } as unknown as Response);

      try {
        await firstValueFrom(service.streamChat('f-1', { message: 'hi' }));
        expect.fail('expected error');
      } catch (e) {
        const err = e as ChatStreamError;
        expect(err.kind).toBe('transport');
        if (err.kind === 'transport') {
          expect(err.status).toBe(0);
          expect(err.code).toBe('NETWORK_ERROR');
          expect(err.message).toBe('stream broke');
        }
      }
    });
  });

  describe('auth token handling', () => {
    it('sends an empty Bearer token when AuthService.getToken() returns null', async () => {
      vi.spyOn(TestBed.inject(AuthService), 'getToken').mockReturnValue(null);
      fetchSpy.mockResolvedValueOnce(makeResponse({ status: 200, bodyChunks: [] }));

      await firstValueFrom(
        service.streamChat('f-1', { message: 'hi' }).pipe(toArray()),
      );

      const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer ');
    });

    it('URL-encodes the familiar id in the request path', async () => {
      fetchSpy.mockResolvedValueOnce(makeResponse({ status: 200, bodyChunks: [] }));

      await firstValueFrom(
        service.streamChat('fam/with space', { message: 'hi' }).pipe(toArray()),
      );

      const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/api/v1/me/familiars/fam%2Fwith%20space/chat');
    });
  });
});
