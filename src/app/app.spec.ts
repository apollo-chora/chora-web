import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideHttpClient()],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render skip-to-content link', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const skipLink = (fixture.nativeElement as HTMLElement).querySelector('.skip-to-content');
    expect(skipLink).toBeTruthy();
    expect(skipLink?.textContent?.trim()).toBe('Skip to content');
    expect(skipLink?.getAttribute('href')).toBe('#main-content');
  });

  it('should render toast container', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const toastContainer = (fixture.nativeElement as HTMLElement).querySelector(
      'chora-toast-container',
    );
    expect(toastContainer).toBeTruthy();
  });

  it('should render confirm dialog', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const confirmDialog = (fixture.nativeElement as HTMLElement).querySelector(
      'chora-confirm-dialog',
    );
    expect(confirmDialog).toBeTruthy();
  });

  it('should omit the skip-to-content link on pre-auth screens', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([{ path: 'login', component: BlankComponent }]),
        provideHttpClient(),
      ],
    }).compileComponents();

    await TestBed.inject(Router).navigateByUrl('/login');

    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).querySelector('.skip-to-content')).toBeNull();
  });
});

@Component({ selector: 'chora-test-blank', template: '' })
class BlankComponent {}
