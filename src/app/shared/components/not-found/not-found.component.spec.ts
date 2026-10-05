import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NotFoundComponent } from './not-found.component';

describe('NotFoundComponent', () => {
  let fixture: ComponentFixture<NotFoundComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NotFoundComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(NotFoundComponent);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should display 404 code', () => {
    const code = fixture.nativeElement.querySelector('.not-found__code');
    expect(code.textContent.trim()).toBe('404');
  });

  it('should display page not found title', () => {
    const title = fixture.nativeElement.querySelector('.not-found__title');
    expect(title.textContent.trim()).toBe('Page Not Found');
  });

  it('should have a link to go home', () => {
    const link = fixture.nativeElement.querySelector('.not-found__link');
    expect(link.textContent.trim()).toBe('Go Home');
  });
});
