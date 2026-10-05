/**
 * RED spec for MapLayersService (C4 frontend slice 1).
 *
 * The map's view-layer state (which lens is active, whether Roads are drawn)
 * used to live inside MapCanvasComponent. The HUD that subagent3 is building
 * sits outside that component and has to read and flip the same state, so it
 * moves here and this service becomes its single owner.
 *
 * Hoisting state out of a component CHANGES ITS LIFETIME, and that is the thing
 * this spec exists to hold. A component instance dies when the learner opens a
 * different map, which silently reset the lens; a root-provided service does
 * not, so the reset has to become explicit or the learner carries the Growth
 * lens from one map onto the next without asking for it. `resetFor` makes it
 * explicit, and it must reset only on a real map CHANGE: re-running it for the
 * map already open would wipe a choice the learner just made.
 */
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { MapLayersService } from './map-layers.service';

describe('MapLayersService', () => {
  let layers: MapLayersService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    layers = TestBed.inject(MapLayersService);
  });

  it('starts on the explore lens with Roads drawn', () => {
    // Roads default ON: the pass-4 mockup ships `roads: true`, and a layer
    // nobody discovers is a layer nobody uses. The toggle exists to turn it OFF.
    expect(layers.lens()).toBe('explore');
    expect(layers.roadsVisible()).toBe(true);
  });

  it('switches the lens', () => {
    layers.setLens('growth');
    expect(layers.lens()).toBe('growth');
  });

  it('toggles Roads both ways', () => {
    layers.toggleRoads();
    expect(layers.roadsVisible()).toBe(false);
    layers.toggleRoads();
    expect(layers.roadsVisible()).toBe(true);
  });

  it('sets Roads to an explicit value', () => {
    layers.setRoadsVisible(false);
    expect(layers.roadsVisible()).toBe(false);
    layers.setRoadsVisible(false);
    expect(layers.roadsVisible()).toBe(false);
  });

  it('resets the layers when the learner opens a DIFFERENT map', () => {
    layers.resetFor('g-a');
    layers.setLens('growth');
    layers.setRoadsVisible(false);

    layers.resetFor('g-b');

    expect(layers.lens()).toBe('explore');
    expect(layers.roadsVisible()).toBe(true);
  });

  it('does NOT reset when called again for the map already open', () => {
    // The canvas re-runs this on every refetch. Treating that as a map change
    // would throw away a lens the learner picked seconds earlier, and it would
    // look like the map randomly forgetting.
    layers.resetFor('g-a');
    layers.setLens('mastery');
    layers.setRoadsVisible(false);

    layers.resetFor('g-a');

    expect(layers.lens()).toBe('mastery');
    expect(layers.roadsVisible()).toBe(false);
  });

  it('treats the first map opened as a change, from a clean start', () => {
    layers.setLens('familiar');
    layers.resetFor('g-a');
    expect(layers.lens()).toBe('explore');
  });
});
