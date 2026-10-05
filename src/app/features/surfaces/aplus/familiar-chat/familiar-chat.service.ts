import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../../environments/environment';
import { AuthService } from '../../../../core/auth/auth.service';
import type {
  ChatEvent,
  ChatRequest,
  ChatStreamError,
} from './familiar-chat.model';

/**
 * Phase J.1 — Familiar Chat SSE-over-POST adapter (ADR-154 D1).
 *
 * Angular's HttpClient does not surface partial response bodies, so the
 * SSE stream goes through `fetch()` directly. AuthService.getToken()
 * stamps the Bearer JWT (parity with the BFF auth interceptor); base URL
 * comes from `environment.bffBaseUrl` to keep BFF-only-HTTP discipline.
 *
 * The Observable emits one `ChatEvent` per parsed SSE frame and completes
 * when the upstream stream closes. 402 surfaces as Observable error with
 * `kind: 'insufficient_mana'` carrying the canonical
 * `InsufficientManaUpsell` envelope; everything else (5xx, network drop)
 * surfaces as `kind: 'transport'` with `{status, code, message}`.
 *
 * Subscription teardown aborts the underlying fetch via AbortController.
 */
@Injectable({ providedIn: 'root' })
export class FamiliarChatService {
  private readonly auth = inject(AuthService);
  private readonly baseUrl = environment.bffBaseUrl;

  streamChat(familiarId: string, request: ChatRequest): Observable<ChatEvent> {
    return new Observable<ChatEvent>((subscriber) => {
      const ctrl = new AbortController();
      const url = `${this.baseUrl}/api/v1/me/familiars/${encodeURIComponent(familiarId)}/chat`;
      const token = this.auth.getToken() ?? '';

      (async () => {
        let response: Response;
        try {
          response = await fetch(url, {
            method: 'POST',
            signal: ctrl.signal,
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
              'Accept': 'text/event-stream',
            },
            body: JSON.stringify(request),
          });
        } catch (err) {
          if (ctrl.signal.aborted) return;
          subscriber.error(this.toTransportError(0, err));
          return;
        }

        if (response.status === 402) {
          subscriber.error(await this.parse402(response));
          return;
        }
        if (!response.ok || !response.body) {
          subscriber.error(await this.parseTransportError(response));
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';

        const consumeFrame = (raw: string) => {
          // Skip comments + blank frames.
          if (!raw || raw.startsWith(':')) return;
          let event: string | null = null;
          const dataLines: string[] = [];
          for (const line of raw.split('\n')) {
            if (line.startsWith('event:')) {
              event = line.slice('event:'.length).trim();
            } else if (line.startsWith('data:')) {
              dataLines.push(line.slice('data:'.length).trim());
            }
          }
          if (!event || dataLines.length === 0) return;
          const data = dataLines.join('\n');
          try {
            const parsed = JSON.parse(data) as Record<string, unknown>;
            subscriber.next({ ...parsed, type: event } as ChatEvent);
          } catch {
            // malformed frame — fail-loud
            subscriber.next({
              type: 'error',
              code: 'INTERNAL_ERROR',
              message: `Malformed SSE frame: ${data}`,
            } as ChatEvent);
          }
        };

        try {
           
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            let idx: number;
            while ((idx = buf.indexOf('\n\n')) !== -1) {
              const frame = buf.slice(0, idx);
              buf = buf.slice(idx + 2);
              consumeFrame(frame);
            }
          }
          // Flush any trailing complete frame (no trailing \n\n).
          buf += decoder.decode();
          if (buf.length > 0) {
            consumeFrame(buf);
          }
          subscriber.complete();
        } catch (err) {
          if (ctrl.signal.aborted) return;
          subscriber.error(this.toTransportError(0, err));
        }
      })();

      return () => ctrl.abort();
    });
  }

  private async parse402(response: Response): Promise<ChatStreamError> {
    try {
      const body = (await response.json()) as {
        error?: { upsell?: ChatStreamError extends infer T
          ? T extends { upsell: infer U }
            ? U
            : never
          : never };
      };
      const upsell = body?.error?.upsell;
      if (upsell) {
        return { kind: 'insufficient_mana', upsell: upsell as never };
      }
    } catch {
      // fall through
    }
    return {
      kind: 'transport',
      status: 402,
      code: 'insufficient_mana',
      message: 'Insufficient mana',
    };
  }

  private async parseTransportError(response: Response): Promise<ChatStreamError> {
    let code = `HTTP_${response.status}`;
    let message = response.statusText || 'Request failed';
    try {
      const body = (await response.json()) as {
        error?: { code?: string; message?: string };
      };
      if (body?.error?.code) code = body.error.code;
      if (body?.error?.message) message = body.error.message;
    } catch {
      // body wasn't JSON; keep defaults
    }
    return { kind: 'transport', status: response.status, code, message };
  }

  private toTransportError(status: number, err: unknown): ChatStreamError {
    const message = err instanceof Error ? err.message : String(err);
    return { kind: 'transport', status, code: 'NETWORK_ERROR', message };
  }
}
