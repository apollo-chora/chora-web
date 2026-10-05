import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'chora_return_url';

@Injectable({ providedIn: 'root' })
export class ReturnUrlService {
  private readonly _returnUrl = signal<string | null>(
    typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(STORAGE_KEY) : null,
  );

  readonly returnUrl = this._returnUrl.asReadonly();

  capture(url: string): void {
    if (url && url !== '/login' && url !== '/register') {
      this._returnUrl.set(url);
      sessionStorage.setItem(STORAGE_KEY, url);
    }
  }

  consume(): string | null {
    const url = this._returnUrl();
    this._returnUrl.set(null);
    sessionStorage.removeItem(STORAGE_KEY);
    return url;
  }
}
