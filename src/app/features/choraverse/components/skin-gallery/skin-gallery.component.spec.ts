import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { SkinGalleryComponent } from './skin-gallery.component';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { SkinRarity, FamiliarSpecies } from '../../models/familiar.model';
import { environment } from '../../../../../environments/environment';
import type { SkinCatalogEntry } from '../../models/gamification.model';

const SKINS_URL = `${environment.bffBaseUrl}/api/v1/gamification/skins`;
const COINS_URL = `${environment.bffBaseUrl}/api/v1/gamification/coins`;

function makeSkin(over: Partial<SkinCatalogEntry> = {}): SkinCatalogEntry {
  return {
    id: 'skin-1',
    name: 'Aurora Fox',
    speciesType: FamiliarSpecies.Fox,
    rarity: SkinRarity.Rare,
    previewUrl: 'https://cdn/skin-1.png',
    starCreditCost: 0,
    isOwned: true,
    category: 'cosmetic',
    theme: 'achievement',
    is_equipped: false,
    is_legendary: false,
    asset_url: 'https://cdn/skin-1-asset.png',
    earn_criteria: {},
    earned_via: 'topic_mastery',
    earned_at: '2026-05-01T00:00:00Z',
    ...over,
  };
}

const STUB_SKINS: SkinCatalogEntry[] = [
  makeSkin({
    id: 'skin-rare-owned',
    name: 'Aurora Fox',
    rarity: SkinRarity.Rare,
    theme: 'achievement',
    isOwned: true,
    is_equipped: false,
    earned_via: 'topic_mastery',
  }),
  makeSkin({
    id: 'skin-epic-equipped',
    name: 'Nebula Owl',
    rarity: SkinRarity.Epic,
    theme: 'premium',
    isOwned: true,
    is_equipped: true,
    starCreditCost: 250,
    earned_via: 'certification',
  }),
  makeSkin({
    id: 'skin-legendary-locked',
    name: 'Phoenix Crown',
    rarity: SkinRarity.Legendary,
    theme: 'seasonal',
    isOwned: false,
    is_equipped: false,
    earned_via: 'legendary_transfer',
  }),
  makeSkin({
    id: 'skin-common-locked',
    name: 'Plain Cat',
    rarity: SkinRarity.Common,
    theme: 'community',
    isOwned: false,
    is_equipped: false,
    earned_via: null,
  }),
];

/**
 * Build the component, flush the two ngOnInit GETs (skins + coins), and
 * return the fixture + httpMock. The skin catalog GET is flushed with
 * `skins` (defaults to STUB_SKINS); coins with `balance`.
 */
function setup(
  skins: SkinCatalogEntry[] = STUB_SKINS,
  balance = 1234,
): {
  fixture: ComponentFixture<SkinGalleryComponent>;
  component: SkinGalleryComponent;
  httpMock: HttpTestingController;
  element: HTMLElement;
} {
  TestBed.configureTestingModule({
    imports: [SkinGalleryComponent],
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const fixture = TestBed.createComponent(SkinGalleryComponent);
  const component = fixture.componentInstance;
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges(); // triggers ngOnInit → both GETs

  httpMock.expectOne(SKINS_URL).flush({ data: skins });
  httpMock.expectOne(COINS_URL).flush({
    id: 'acct-1',
    gcid: 'gcid-1',
    balance,
    lifetime_earned: balance,
    lifetime_spent: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-05-01T00:00:00Z',
  });
  fixture.detectChanges();

  return {
    fixture,
    component,
    httpMock,
    element: fixture.nativeElement as HTMLElement,
  };
}

// ---------------------------------------------------------------------------
// Original suite (kept intact — does NOT flush the ngOnInit GETs by design)
// ---------------------------------------------------------------------------

describe('SkinGalleryComponent', () => {
  let component: SkinGalleryComponent;
  let fixture: ComponentFixture<SkinGalleryComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SkinGalleryComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(SkinGalleryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have data-testid attribute', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="skin-gallery"]');
    expect(el).toBeTruthy();
  });

  it('should start with no filters', () => {
    expect(component.filterRarity()).toBeNull();
    expect(component.filterTheme()).toBeNull();
  });

  it('should set rarity filter', () => {
    component.onRarityFilter('rare');
    expect(component.filterRarity()).toBe('rare');
    component.onRarityFilter('');
    expect(component.filterRarity()).toBeNull();
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

// ---------------------------------------------------------------------------
// Augmented suite — drives the loaded-data states, filters, interactions,
// equip flow, wishlist, helpers, and error paths.
// ---------------------------------------------------------------------------

describe('SkinGalleryComponent — loading lifecycle', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('starts in loading state and renders skeleton cards before flush', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [SkinGalleryComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(SkinGalleryComponent);
    const component = fixture.componentInstance;
    const httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges(); // ngOnInit → loading

    expect(component.isLoading()).toBe(true);
    const loading = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="skin-gallery-loading"]',
    );
    expect(loading).not.toBeNull();
    expect(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.skin-gallery__skeleton-card')
        .length,
    ).toBe(6);

    // settle the outstanding GETs for verify()
    httpMock.expectOne(SKINS_URL).flush({ data: STUB_SKINS });
    httpMock.expectOne(COINS_URL).flush({
      id: 'a',
      gcid: 'g',
      balance: 0,
      lifetime_earned: 0,
      lifetime_spent: 0,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });
  });

  it('issues GET skins + GET coins on init with correct verbs and urls', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [SkinGalleryComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(SkinGalleryComponent);
    const httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    const skinsReq = httpMock.expectOne(SKINS_URL);
    expect(skinsReq.request.method).toBe('GET');
    skinsReq.flush({ data: STUB_SKINS });

    const coinsReq = httpMock.expectOne(COINS_URL);
    expect(coinsReq.request.method).toBe('GET');
    coinsReq.flush({
      id: 'a',
      gcid: 'g',
      balance: 99,
      lifetime_earned: 99,
      lifetime_spent: 0,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });
  });
});

describe('SkinGalleryComponent — ready state render', () => {
  let component: SkinGalleryComponent;
  let httpMock: HttpTestingController;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = setup();
    component = built.component;
    httpMock = built.httpMock;
    element = built.element;
  });

  afterEach(() => httpMock.verify());

  it('leaves loading after both GETs flush', () => {
    expect(component.isLoading()).toBe(false);
    expect(component.isEmpty()).toBe(false);
  });

  it('renders the coin balance from the coins GET', () => {
    expect(component.coinBalance()).toBe(1234);
    const bal = element.querySelector('[data-testid="star-credit-balance"]');
    expect(bal?.textContent).toContain('1234');
  });

  it('shows filtered / total count in the header', () => {
    expect(component.totalCount()).toBe(4);
    expect(component.filteredCount()).toBe(4);
    const count = element.querySelector('.skin-gallery__count');
    expect(count?.textContent).toContain('4 / 4');
  });

  it('groups skins into one theme-section per occupied theme', () => {
    // STUB_SKINS spans achievement, premium, seasonal, community → 4 groups
    const groups = component.skinsByTheme();
    expect(groups.length).toBe(4);
    const sections = element.querySelectorAll('.skin-gallery__theme-section');
    expect(sections.length).toBe(4);
  });

  it('renders a card per skin with its name', () => {
    const card = element.querySelector('[data-testid="gallery-skin-skin-rare-owned"]');
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain('Aurora Fox');
  });

  it('renders an Equipped button for the equipped skin', () => {
    const btn = element.querySelector(
      '[data-testid="gallery-btn-equipped-skin-epic-equipped"]',
    ) as HTMLButtonElement | null;
    expect(btn).not.toBeNull();
    expect(btn?.disabled).toBe(true);
  });

  it('renders an Equip button for owned-not-equipped skins', () => {
    const btn = element.querySelector('[data-testid="gallery-btn-equip-skin-rare-owned"]');
    expect(btn).not.toBeNull();
  });

  it('renders a Locked label for unowned skins (no equip button)', () => {
    expect(
      element.querySelector('[data-testid="gallery-btn-equip-skin-legendary-locked"]'),
    ).toBeNull();
    const card = element.querySelector('[data-testid="gallery-skin-skin-legendary-locked"]');
    expect(card?.querySelector('.skin-gallery__card-locked')).not.toBeNull();
  });
});

describe('SkinGalleryComponent — empty state', () => {
  it('renders the empty state when the catalog is empty', () => {
    TestBed.resetTestingModule();
    const { component, element, httpMock } = setup([]);
    expect(component.isEmpty()).toBe(true);
    expect(component.filteredCount()).toBe(0);
    expect(element.querySelector('[data-testid="skin-gallery-empty"]')).not.toBeNull();
    httpMock.verify();
  });

  it('renders the empty state when all skins are filtered out', () => {
    TestBed.resetTestingModule();
    const { component, fixture, element, httpMock } = setup();
    component.searchQuery.set('zzz-no-match');
    fixture.detectChanges();
    expect(component.filteredCount()).toBe(0);
    expect(component.isEmpty()).toBe(true);
    expect(element.querySelector('[data-testid="skin-gallery-empty"]')).not.toBeNull();
    httpMock.verify();
  });
});

describe('SkinGalleryComponent — filters', () => {
  let component: SkinGalleryComponent;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = setup();
    component = built.component;
    httpMock = built.httpMock;
  });

  afterEach(() => httpMock.verify());

  it('filters by rarity', () => {
    component.onRarityFilter('rare');
    expect(component.filterRarity()).toBe('rare');
    expect(component.filteredSkins().map((s) => s.id)).toEqual(['skin-rare-owned']);
    component.onRarityFilter('');
    expect(component.filterRarity()).toBeNull();
    expect(component.filteredCount()).toBe(4);
  });

  it('filters by theme', () => {
    component.onThemeFilter('premium');
    expect(component.filterTheme()).toBe('premium');
    expect(component.filteredSkins().map((s) => s.id)).toEqual(['skin-epic-equipped']);
    component.onThemeFilter('');
    expect(component.filterTheme()).toBeNull();
  });

  it('filters by ownership = owned', () => {
    component.onOwnershipFilter('owned');
    expect(component.filterOwnership()).toBe('owned');
    expect(component.filteredSkins().every((s) => s.isOwned)).toBe(true);
    expect(component.filteredCount()).toBe(2);
  });

  it('filters by ownership = locked', () => {
    component.onOwnershipFilter('locked');
    expect(component.filterOwnership()).toBe('locked');
    expect(component.filteredSkins().every((s) => !s.isOwned)).toBe(true);
    expect(component.filteredCount()).toBe(2);
  });

  it('filters by search query (case-insensitive, trimmed)', () => {
    const event = { target: { value: '  AURORA  ' } } as unknown as Event;
    component.onSearch(event);
    expect(component.searchQuery()).toBe('  AURORA  ');
    expect(component.filteredSkins().map((s) => s.id)).toEqual(['skin-rare-owned']);
  });

  it('combines rarity + ownership filters', () => {
    component.onRarityFilter('legendary');
    component.onOwnershipFilter('locked');
    expect(component.filteredSkins().map((s) => s.id)).toEqual(['skin-legendary-locked']);
  });
});

describe('SkinGalleryComponent — preview / select', () => {
  let component: SkinGalleryComponent;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = setup();
    component = built.component;
    httpMock = built.httpMock;
  });

  afterEach(() => httpMock.verify());

  it('selects a skin then toggles it off when re-selected', () => {
    const skin = STUB_SKINS[0];
    component.selectSkin(skin);
    expect(component.selectedSkin()?.id).toBe(skin.id);
    expect(component.isSelected(skin.id)).toBe(true);

    component.selectSkin(skin); // same skin → deselect
    expect(component.selectedSkin()).toBeNull();
    expect(component.isSelected(skin.id)).toBe(false);
  });

  it('switches selection to a different skin', () => {
    component.selectSkin(STUB_SKINS[0]);
    component.selectSkin(STUB_SKINS[1]);
    expect(component.selectedSkin()?.id).toBe(STUB_SKINS[1].id);
    expect(component.isSelected(STUB_SKINS[0].id)).toBe(false);
  });
});

describe('SkinGalleryComponent — equip flow', () => {
  let fixture: ComponentFixture<SkinGalleryComponent>;
  let component: SkinGalleryComponent;
  let httpMock: HttpTestingController;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = setup();
    fixture = built.fixture;
    component = built.component;
    httpMock = built.httpMock;
    element = built.element;
  });

  afterEach(() => httpMock.verify());

  it('does NOT open the equip dialog for an unowned skin', () => {
    const locked = STUB_SKINS.find((s) => !s.isOwned)!;
    component.openEquipDialog(locked);
    expect(component.showEquipDialog()).toBe(false);
  });

  it('opens the equip dialog for an owned skin and selects it', () => {
    const owned = STUB_SKINS.find((s) => s.isOwned)!;
    component.openEquipDialog(owned);
    fixture.detectChanges();
    expect(component.showEquipDialog()).toBe(true);
    expect(component.selectedSkin()?.id).toBe(owned.id);
    expect(element.querySelector('[data-testid="equip-dialog"]')).not.toBeNull();
  });

  it('cancelEquip closes the dialog', () => {
    component.openEquipDialog(STUB_SKINS[0]);
    component.cancelEquip();
    fixture.detectChanges();
    expect(component.showEquipDialog()).toBe(false);
    expect(element.querySelector('[data-testid="equip-dialog"]')).toBeNull();
  });

  it('confirmEquip is a no-op when no skin is selected', () => {
    component.selectedSkin.set(null);
    component.confirmEquip('profile_photo');
    httpMock.expectNone(
      `${environment.bffBaseUrl}/api/v1/gamification/skins/equipment/profile_photo`,
    );
  });

  it('confirmEquip PUTs to the slot endpoint, shows success toast, closes dialog', () => {
    const toast = TestBed.inject(ToastService);
    const showSpy = vi.spyOn(toast, 'show');
    const owned = STUB_SKINS.find((s) => s.isOwned)!;
    component.openEquipDialog(owned);
    fixture.detectChanges();

    component.confirmEquip('name_badge');
    const req = httpMock.expectOne(
      `${environment.bffBaseUrl}/api/v1/gamification/skins/equipment/name_badge`,
    );
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ skin_award_id: owned.id });
    req.flush({});
    fixture.detectChanges();

    expect(component.showEquipDialog()).toBe(false);
    expect(showSpy).toHaveBeenCalledWith('choraverse.skin_gallery.skin_equipped', 'success');
  });

  it('keeps the dialog open on a failed equip PUT (service swallows the error)', () => {
    // PROD BUG (characterized): GamificationService.equipSkin catchError-maps
    // the HTTP failure to `of(false)`, so the component's `error:` callback
    // never fires and `equip_error` toast is dead code. confirmEquip's
    // `next(false)` skips the success toast AND the showEquipDialog.set(false),
    // so the dialog stays open with NO error toast surfaced. We characterize
    // the actual (buggy) behaviour to keep the spec green — see prodBugFlag.
    const toast = TestBed.inject(ToastService);
    const showSpy = vi.spyOn(toast, 'show');
    const owned = STUB_SKINS.find((s) => s.isOwned)!;
    component.openEquipDialog(owned);
    fixture.detectChanges();

    component.confirmEquip('class_profile');
    httpMock
      .expectOne(`${environment.bffBaseUrl}/api/v1/gamification/skins/equipment/class_profile`)
      .flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    // Dialog stays open (success branch never ran) ...
    expect(component.showEquipDialog()).toBe(true);
    // ... and the equip_error toast is NEVER shown (dead error callback).
    expect(showSpy).not.toHaveBeenCalledWith('choraverse.skin_gallery.equip_error', 'error');
  });
});

describe('SkinGalleryComponent — wishlist', () => {
  let component: SkinGalleryComponent;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = setup();
    component = built.component;
    httpMock = built.httpMock;
  });

  afterEach(() => httpMock.verify());

  it('toggles a skin into and out of the wishlist', () => {
    expect(component.isWishlisted('skin-rare-owned')).toBe(false);
    component.toggleWishlist('skin-rare-owned');
    expect(component.isWishlisted('skin-rare-owned')).toBe(true);
    expect(component.wishlist().has('skin-rare-owned')).toBe(true);
    component.toggleWishlist('skin-rare-owned');
    expect(component.isWishlisted('skin-rare-owned')).toBe(false);
  });

  it('tracks multiple wishlisted skins independently', () => {
    component.toggleWishlist('a');
    component.toggleWishlist('b');
    expect(component.wishlist().size).toBe(2);
    component.toggleWishlist('a');
    expect(component.wishlist().has('a')).toBe(false);
    expect(component.wishlist().has('b')).toBe(true);
  });
});

describe('SkinGalleryComponent — helpers', () => {
  let component: SkinGalleryComponent;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = setup();
    component = built.component;
    httpMock = built.httpMock;
  });

  afterEach(() => httpMock.verify());

  it('rarityBorderColor returns the rarity color hex', () => {
    expect(component.rarityBorderColor(SkinRarity.Legendary)).toBe('#eab308');
    expect(component.rarityBorderColor(SkinRarity.Common)).toBe('#9ca3af');
  });

  it('rarityGlowStyle composes a box-shadow string with the rarity color', () => {
    const glow = component.rarityGlowStyle(SkinRarity.Rare);
    expect(glow).toContain('#3b82f6');
    expect(glow).toContain('0 0 12px');
  });

  it('earnViaLabel maps a known criterion to its i18n key', () => {
    expect(component.earnViaLabel('streak')).toBe('choraverse.skin_gallery.earn_streak');
    expect(component.earnViaLabel('certification')).toBe(
      'choraverse.skin_gallery.earn_certification',
    );
  });

  it('earnViaLabel falls back to earn_unknown for null or unmapped values', () => {
    expect(component.earnViaLabel(null)).toBe('choraverse.skin_gallery.earn_unknown');
    expect(component.earnViaLabel('not-a-real-criterion')).toBe(
      'choraverse.skin_gallery.earn_unknown',
    );
  });
});

describe('SkinGalleryComponent — error path', () => {
  it('records error state when the skins GET fails (toast is dead code)', () => {
    // PROD BUG (characterized): GamificationService.loadSkins catchError-maps
    // the failure to `of(null)`, so loadSkins().subscribe({ error: ... }) never
    // sees an error → the component's `load_error` toast callback is dead code.
    // The catalog state DOES flip to 'error', so the UI shows the empty state
    // (isEmpty is true once not-loading + zero filtered skins) but no toast.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [SkinGalleryComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(SkinGalleryComponent);
    const component = fixture.componentInstance;
    const httpMock = TestBed.inject(HttpTestingController);
    const toast = TestBed.inject(ToastService);
    const showSpy = vi.spyOn(toast, 'show');
    fixture.detectChanges();

    httpMock
      .expectOne(SKINS_URL)
      .flush({ error: 'nope' }, { status: 500, statusText: 'Server Error' });
    // coins GET also fires on init; flush it so verify() is clean
    httpMock
      .expectOne(COINS_URL)
      .flush({ error: 'nope' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(component.skinCatalogState().status).toBe('error');
    expect(component.isLoading()).toBe(false);
    expect(component.isEmpty()).toBe(true);
    // Dead error callback → no load_error toast is ever shown.
    expect(showSpy).not.toHaveBeenCalledWith('choraverse.skin_gallery.load_error', 'error');
    httpMock.verify();
  });

  it('unsubscribes on destroy without error', () => {
    TestBed.resetTestingModule();
    const { fixture, httpMock } = setup();
    expect(() => fixture.destroy()).not.toThrow();
    httpMock.verify();
  });
});
