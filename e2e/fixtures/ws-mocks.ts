import { type Page } from '@playwright/test';

export async function installWebSocketMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const OriginalWebSocket = window.WebSocket;
    const mockSockets: WebSocket[] = [];

    (window as Record<string, unknown>)['__mockWSSend'] = (data: string) => {
      mockSockets.forEach((ws) => {
        ws.dispatchEvent(new MessageEvent('message', { data }));
      });
    };

    window.WebSocket = class extends OriginalWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        mockSockets.push(this);
      }
    } as typeof WebSocket;
  });
}

export async function simulateWsMessage(page: Page, data: unknown): Promise<void> {
  await page.evaluate((json) => {
    const sender = (window as Record<string, unknown>)['__mockWSSend'] as
      | ((data: string) => void)
      | undefined;
    if (sender) {
      sender(JSON.stringify(json));
    }
  }, data);
}
