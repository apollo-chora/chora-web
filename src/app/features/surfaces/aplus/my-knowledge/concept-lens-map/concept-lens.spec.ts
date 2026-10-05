import {
  buildLensLayout,
  freeFogSlots,
  fogSlotAngle,
  FOG_SLOT_COUNT,
  fisheyeDistort,
  neighbourhoodFitScale,
  wrapLabel,
  layoutLabel,
  provinceLabelScale,
  LABEL_MAX,
  LABEL_HARD_CAP,
  LABEL_MIN_SCALE,
  FORT_INSET,
  FORT_STROKE,
  PROVINCE_LABEL_FIT,
  roundedHexPath,
  nodeShadowFilter,
  nodePaint,
  isShakyNode,
  isDueNode,
  easeOutCubic,
  easeMostlyLinear,
  campaignHexState,
  wonDescendantCount,
  HEX_R,
  LENS_CX,
  LENS_CY,
  LENS_RADIUS,
  LENS_VIEWBOX_W,
  LENS_VIEWBOX_H,
  LAYOUT_FIT_RADIUS,
  LENS_Z_MAX,
  LENS_Z_MIN,
} from './concept-lens';
import type {
  ConceptEdge,
  ConceptNode,
} from '../../discovery-graph/concept-graph.model';
import type { CampaignNodeState } from '../campaign.model';

function concept(
  conceptId: string,
  title: string,
  over: Partial<ConceptNode> = {},
): ConceptNode {
  return { conceptId, title, atomRefs: [], ...over };
}

function edge(
  edgeId: string,
  source: string,
  target: string,
  cls: 'hierarchy' | 'lateral' = 'hierarchy',
): ConceptEdge {
  return {
    edgeId,
    sourceConceptId: source,
    targetConceptId: target,
    class: cls,
    provenance: 'learner_authored',
  };
}

/** Radius of a laid-out point from the viewBox centre. */
function radius(x: number, y: number): number {
  return Math.hypot(x - LENS_CX, y - LENS_CY);
}

describe('concept-lens geometry', () => {
  describe('buildLensLayout', () => {
    it('returns an empty layout (rootId null) for no concepts', () => {
      const l = buildLensLayout([], []);
      expect(l.nodes).toEqual([]);
      expect(l.rootId).toBeNull();
    });

    it('places a single concept at the viewBox centre as the root', () => {
      const l = buildLensLayout([concept('a', 'Alone')], []);
      expect(l.rootId).toBe('a');
      expect(l.nodes).toHaveLength(1);
      expect(l.nodes[0].conceptId).toBe('a');
      expect(l.nodes[0].x).toBeCloseTo(LENS_CX, 5);
      expect(l.nodes[0].y).toBeCloseTo(LENS_CY, 5);
      expect(l.nodes[0].depth).toBe(0);
    });

    it('derives the root as the single hierarchy-parentless concept', () => {
      const l = buildLensLayout(
        [concept('root', 'Root'), concept('kid', 'Kid')],
        [edge('e1', 'root', 'kid', 'hierarchy')],
      );
      expect(l.rootId).toBe('root');
      const root = l.nodes.find((n) => n.conceptId === 'root')!;
      expect(root.x).toBeCloseTo(LENS_CX, 5);
      expect(root.y).toBeCloseTo(LENS_CY, 5);
      expect(root.depth).toBe(0);
    });

    it('honours an explicit rootId even when another node is parentless', () => {
      // Two rootless concepts (no edges): derivation is ambiguous, so explicit wins.
      const l = buildLensLayout(
        [concept('a', 'A'), concept('b', 'B')],
        [],
        'b',
      );
      expect(l.rootId).toBe('b');
      const b = l.nodes.find((n) => n.conceptId === 'b')!;
      expect(b.x).toBeCloseTo(LENS_CX, 5);
      expect(b.y).toBeCloseTo(LENS_CY, 5);
    });

    it('lays out EVERY concept exactly once (no node ever dropped)', () => {
      const concepts = [
        concept('root', 'Root'),
        concept('c1', 'One'),
        concept('c2', 'Two'),
        concept('c3', 'Three'),
      ];
      const edges = [
        edge('e1', 'root', 'c1'),
        edge('e2', 'root', 'c2'),
        edge('e3', 'c1', 'c3'),
      ];
      const l = buildLensLayout(concepts, edges, 'root');
      expect(l.nodes).toHaveLength(4);
      expect(new Set(l.nodes.map((n) => n.conceptId))).toEqual(
        new Set(['root', 'c1', 'c2', 'c3']),
      );
    });

    it('keeps every laid-out point inside the fit radius of the centre', () => {
      const concepts = [
        concept('root', 'Root'),
        concept('c1', 'One'),
        concept('c2', 'Two'),
        concept('c3', 'Three'),
        concept('c4', 'Four'),
      ];
      const edges = [
        edge('e1', 'root', 'c1'),
        edge('e2', 'root', 'c2'),
        edge('e3', 'c1', 'c3'),
        edge('e4', 'c2', 'c4'),
      ];
      const l = buildLensLayout(concepts, edges, 'root');
      for (const n of l.nodes) {
        // Normalised so the furthest node sits at LAYOUT_FIT_RADIUS; allow a hair.
        expect(radius(n.x, n.y)).toBeLessThanOrEqual(LAYOUT_FIT_RADIUS + 0.5);
        // And within the drawable viewBox.
        expect(n.x).toBeGreaterThanOrEqual(0);
        expect(n.x).toBeLessThanOrEqual(LENS_VIEWBOX_W);
        expect(n.y).toBeGreaterThanOrEqual(0);
        expect(n.y).toBeLessThanOrEqual(LENS_VIEWBOX_H);
      }
    });

    it('still places a disconnected concept (never hidden) inside bounds', () => {
      const l = buildLensLayout(
        [concept('root', 'Root'), concept('kid', 'Kid'), concept('island', 'Island')],
        [edge('e1', 'root', 'kid')],
        'root',
      );
      expect(l.nodes).toHaveLength(3);
      const island = l.nodes.find((n) => n.conceptId === 'island');
      expect(island).toBeDefined();
      expect(radius(island!.x, island!.y)).toBeLessThanOrEqual(
        LAYOUT_FIT_RADIUS + 0.5,
      );
    });

    it('is cycle-safe: a hierarchy cycle terminates and keeps all nodes', () => {
      const l = buildLensLayout(
        [concept('a', 'A'), concept('b', 'B'), concept('c', 'C')],
        [
          edge('e1', 'a', 'b'),
          edge('e2', 'b', 'c'),
          edge('e3', 'c', 'a'), // back-edge → cycle
        ],
        'a',
      );
      expect(l.nodes).toHaveLength(3);
    });

    it('ignores lateral edges for the radial tree but never crashes on them', () => {
      const l = buildLensLayout(
        [concept('root', 'Root'), concept('k', 'K'), concept('s', 'S')],
        [
          edge('e1', 'root', 'k', 'hierarchy'),
          edge('e2', 'k', 's', 'lateral'), // lateral: s is not a hierarchy child
        ],
        'root',
      );
      // s is not hierarchy-reachable → placed as a disconnected node, still present.
      expect(l.nodes).toHaveLength(3);
      expect(l.nodes.find((n) => n.conceptId === 's')).toBeDefined();
    });
  });

  describe('fisheyeDistort', () => {
    it('magnifies at the focus and shrinks toward the periphery', () => {
      const atFocus = fisheyeDistort(LENS_CX, LENS_CY, LENS_CX, LENS_CY);
      const near = fisheyeDistort(LENS_CX + 60, LENS_CY, LENS_CX, LENS_CY);
      const far = fisheyeDistort(
        LENS_CX + LENS_RADIUS - 5,
        LENS_CY,
        LENS_CX,
        LENS_CY,
      );
      expect(atFocus.z).toBeGreaterThan(near.z);
      expect(near.z).toBeGreaterThan(far.z);
      // Focus is the max scale; periphery never collapses below the floor.
      expect(atFocus.z).toBeCloseTo(LENS_Z_MAX, 5);
      expect(far.z).toBeGreaterThanOrEqual(LENS_Z_MIN - 1e-6);
    });

    it('returns the point unchanged at/over the lens edge', () => {
      const p = fisheyeDistort(
        LENS_CX + LENS_RADIUS + 40,
        LENS_CY,
        LENS_CX,
        LENS_CY,
      );
      expect(p.x).toBeCloseTo(LENS_CX + LENS_RADIUS + 40, 5);
      expect(p.y).toBeCloseTo(LENS_CY, 5);
    });

    it('pushes a node radially AWAY from the focus (spreads the neighbourhood)', () => {
      const src = { x: LENS_CX + 40, y: LENS_CY };
      const out = fisheyeDistort(src.x, src.y, LENS_CX, LENS_CY);
      // Same side of the focus, but farther out than the base position.
      expect(out.x).toBeGreaterThan(src.x);
      expect(out.y).toBeCloseTo(LENS_CY, 5);
    });
  });

  describe('neighbourhoodFitScale', () => {
    it('shrinks (fit < 1) when the immediate ring would overflow the frame edge', () => {
      // Focus at centre; one child straight UP at the layout fit radius. The
      // fisheye pushes it past the viewBox top, so the neighbourhood must shrink
      // for the whole child to stay on screen.
      const focus = { x: LENS_CX, y: LENS_CY };
      const child = { x: LENS_CX, y: LENS_CY - LAYOUT_FIT_RADIUS };
      const fit = neighbourhoodFitScale(
        [focus, child],
        focus,
        LENS_CX - 8,
        LENS_CY - 8,
      );
      expect(fit).toBeGreaterThan(0);
      expect(fit).toBeLessThan(1);
      // Applying the fit brings the child's TOP within the viewBox (y ≥ 0).
      const d = fisheyeDistort(child.x, child.y, focus.x, focus.y);
      const top = focus.y + (d.y - focus.y) * fit - HEX_R * d.z;
      expect(top).toBeGreaterThanOrEqual(0);
    });

    it('does not enlarge (fit = 1) when the neighbourhood already fits', () => {
      const focus = { x: LENS_CX, y: LENS_CY };
      const near = { x: LENS_CX + 30, y: LENS_CY };
      const fit = neighbourhoodFitScale(
        [focus, near],
        focus,
        LENS_CX - 8,
        LENS_CY - 8,
      );
      expect(fit).toBe(1);
    });

    it('returns 1 for a lone focus (no neighbours to contain)', () => {
      const focus = { x: LENS_CX, y: LENS_CY };
      expect(
        neighbourhoodFitScale([focus], focus, LENS_CX - 8, LENS_CY - 8),
      ).toBe(1);
    });

    it('shrinks harder as the available width narrows (drawer covers the canvas)', () => {
      // Same neighbourhood, a narrower uncovered region ⇒ a smaller fit so the
      // ring still fits beside the open drawer.
      const focus = { x: LENS_CX, y: LENS_CY };
      const ring = [
        { x: LENS_CX + LAYOUT_FIT_RADIUS, y: LENS_CY },
        { x: LENS_CX - LAYOUT_FIT_RADIUS, y: LENS_CY },
      ];
      const wide = neighbourhoodFitScale([focus, ...ring], focus, LENS_CX - 8, LENS_CY - 8);
      const narrow = neighbourhoodFitScale([focus, ...ring], focus, 220, LENS_CY - 8);
      expect(narrow).toBeLessThan(wide);
    });
  });

  describe('wrapLabel', () => {
    it('keeps a short label on one line', () => {
      expect(wrapLabel('Ratio', 12)).toEqual(['Ratio']);
    });

    it('wraps a long multi-word label to two lines', () => {
      expect(wrapLabel('Common Denominator', 12)).toEqual([
        'Common',
        'Denominator',
      ]);
      expect(wrapLabel('Unit Numerator', 12)).toEqual(['Unit', 'Numerator']);
      expect(wrapLabel('Equivalent Fractions', 12)).toEqual([
        'Equivalent',
        'Fractions',
      ]);
    });

    it('cannot split a single long word (returns it whole)', () => {
      expect(wrapLabel('Supercalifragilistic', 12)).toEqual([
        'Supercalifragilistic',
      ]);
    });

    it('produces at most two lines', () => {
      const lines = wrapLabel('one two three four five six', 12);
      expect(lines.length).toBeLessThanOrEqual(2);
    });

    it('puts the first word on line 1 even when it exceeds max (was: empty l1 → whole title dumped on one line)', () => {
      const lines = wrapLabel('Light-Dependent Photosynthesis Stages', 12);
      expect(lines[0]).toBe('Light-Dependent');
      expect(lines[0]).not.toBe('');
      expect(lines.length).toBeLessThanOrEqual(2);
    });
  });

  describe('layoutLabel (fit-to-hex, applies to EVERY node)', () => {
    it('leaves a short label full-size on one line (scale 1)', () => {
      expect(layoutLabel('Ratio')).toEqual({ lines: ['Ratio'], scale: 1 });
    });

    it('shrinks an over-long single word to fit rather than truncating it', () => {
      const { lines, scale } = layoutLabel('Photosynthesis'); // 14 > LABEL_MAX
      expect(lines).toEqual(['Photosynthesis']);
      expect(scale).toBeLessThan(1);
      expect(scale).toBeGreaterThanOrEqual(LABEL_MIN_SCALE);
    });

    it('caps each line to the hard cap and ellipsizes the overflow', () => {
      const { lines, scale } = layoutLabel(
        'Light-Dependent Photosynthesis Stages',
      );
      expect(lines.length).toBe(2);
      for (const ln of lines) {
        expect(ln.length).toBeLessThanOrEqual(LABEL_HARD_CAP);
      }
      expect(lines.some((l) => l.endsWith('…'))).toBe(true);
      expect(scale).toBeGreaterThanOrEqual(LABEL_MIN_SCALE);
      expect(scale).toBeLessThanOrEqual(1);
    });

    it('NEVER lets a line exceed the hex width budget once scaled (no spill)', () => {
      const cases = [
        'Reported Speech',
        'Binary Search Algorithm',
        'Light-Dependent Photosynthesis Stages',
        'Antidisestablishmentarianism',
        'A B C D E F G H I J K',
      ];
      for (const t of cases) {
        const { lines, scale } = layoutLabel(t);
        for (const ln of lines) {
          // effective width (base-char units) = len × scale must fit LABEL_MAX
          expect(ln.length * scale).toBeLessThanOrEqual(LABEL_MAX + 0.5);
        }
      }
    });
  });

  // Bug #20: a won PROVINCE hex draws an inset "fortified wall" ring, but
  // layoutLabel sizes the label to the OUTER hex — so a full-width label overruns
  // the wall. The whole node (hex + wall + label) shares one scale(z), so the
  // overrun is z-INVARIANT (present selected AND receded) and only shows once the
  // hex de-selects (high-contrast wall). provinceLabelScale shrinks ONLY an
  // overrunning province label so it clears the wall at every radius.
  describe('provinceLabelScale (bug #20 — label clears the province wall)', () => {
    it('leaves a NON-province label untouched (no regression off-province)', () => {
      expect(provinceLabelScale(['Framework Essent…'], 0.706, false)).toBe(0.706);
      expect(provinceLabelScale(['Ratio'], 1, false)).toBe(1);
    });

    it('leaves a SHORT province label that already clears the wall untouched', () => {
      // longest × scale already within the inner-wall budget → no shrink.
      expect(provinceLabelScale(['Ratio'], 1, true)).toBe(1); // 5 ≤ budget
      expect(provinceLabelScale(['Numerator'], 1, true)).toBe(1); // 9 ≤ budget
    });

    it('shrinks a full-width province label to fit the inner wall (the bug case)', () => {
      const { lines, scale } = layoutLabel('Scrum Framework Essentials');
      const longest = lines.reduce((m, ln) => Math.max(m, ln.length), 0);
      const prov = provinceLabelScale(lines, scale, true);
      // Shrunk below the base (outer-hex) fit…
      expect(prov).toBeLessThan(scale);
      // …to within the inner-wall char budget (LABEL_MAX × PROVINCE_LABEL_FIT).
      expect(longest * prov).toBeLessThanOrEqual(LABEL_MAX * PROVINCE_LABEL_FIT + 0.05);
    });

    it('clears the fort wall at BOTH the selected (z-max) and receded (z-min) radius', () => {
      // Node-local geometry: everything under the node scales by z together. The
      // design-max char width is 2·HEX_R / LABEL_MAX (a LABEL_MAX line = hex
      // width); the wall inner edge sits at HEX_R·FORT_INSET − FORT_STROKE/2.
      const charW = (2 * HEX_R) / LABEL_MAX;
      const wallInnerHalf = (z: number) =>
        (HEX_R * FORT_INSET - FORT_STROKE / 2) * z;
      const labelHalf = (longest: number, s: number, z: number) =>
        ((longest * s) * charW) / 2 * z;

      const { lines, scale } = layoutLabel('Scrum Framework Essentials');
      const longest = lines.reduce((m, ln) => Math.max(m, ln.length), 0);
      const prov = provinceLabelScale(lines, scale, true);

      for (const z of [LENS_Z_MAX, LENS_Z_MIN]) {
        // FIXED: the province-fitted label stays inside the wall at this radius…
        expect(labelHalf(longest, prov, z)).toBeLessThanOrEqual(wallInnerHalf(z) + 1e-6);
        // …whereas the UNFIXED (outer-hex) label overruns it — the bug — and it
        // overruns at EVERY radius, proving the clash is not z-specific.
        expect(labelHalf(longest, scale, z)).toBeGreaterThan(wallInnerHalf(z));
      }
    });
  });

  describe('roundedHexPath', () => {
    it('is a closed path with quadratic (rounded) corners', () => {
      const d = roundedHexPath();
      expect(d.startsWith('M')).toBe(true);
      expect(d.trimEnd().endsWith('Z')).toBe(true);
      expect(d).toContain('Q'); // rounded corners
    });
  });

  describe('nodeShadowFilter', () => {
    it('uses a neutral grey (never indigo) for the field', () => {
      const f = nodeShadowFilter(1, false);
      expect(f.startsWith('drop-shadow(')).toBe(true);
      expect(f).toContain('44,47,58'); // GREY slate — not indigo
    });

    it('lifts the focus with a softer, larger shadow', () => {
      const focus = nodeShadowFilter(1.4, true);
      expect(focus).toContain('44,47,58');
      // Focus blur radius is larger than a field node's.
      expect(focus).toContain('13px');
    });
  });

  describe('easeOutCubic', () => {
    it('maps the unit interval with an ease-out curve', () => {
      expect(easeOutCubic(0)).toBeCloseTo(0, 5);
      expect(easeOutCubic(1)).toBeCloseTo(1, 5);
      expect(easeOutCubic(0.5)).toBeCloseTo(0.875, 5); // 1-(0.5)^3
    });
  });

  describe('easeMostlyLinear', () => {
    it('maps the unit interval, symmetric, crossing the midpoint', () => {
      expect(easeMostlyLinear(0)).toBeCloseTo(0, 5);
      expect(easeMostlyLinear(1)).toBeCloseTo(1, 5);
      expect(easeMostlyLinear(0.5)).toBeCloseTo(0.5, 5);
      // Symmetric about (0.5, 0.5): f(u) + f(1-u) = 1.
      expect(easeMostlyLinear(0.25) + easeMostlyLinear(0.75)).toBeCloseTo(1, 5);
    });

    it('runs at CONSTANT velocity through the middle (mostly linear)', () => {
      // Equal-time steps in the plateau cover equal distance — a straight line,
      // unlike an ease-in-out curve which keeps accelerating (owner 2026-07-16).
      const d1 = easeMostlyLinear(0.5) - easeMostlyLinear(0.4);
      const d2 = easeMostlyLinear(0.6) - easeMostlyLinear(0.5);
      expect(d2).toBeCloseTo(d1, 6); // constant velocity → equal deltas
    });

    it('still eases the ends to zero velocity (a hint of bell, no lurch)', () => {
      // Soft start: at u=0.1 it has moved LESS than linear (eased in)…
      expect(easeMostlyLinear(0.1)).toBeLessThan(0.1);
      // …but MORE than the pronounced in-out quad — i.e. much closer to linear.
      const quad = (u: number) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
      expect(easeMostlyLinear(0.1)).toBeGreaterThan(quad(0.1));
    });
  });

  // The map-hex overlay classifier realising the WS-D lens spec (map-canvas
  // §5 — "Explore = all · Growth = shaky · Mastery = mastered"; the fisheye
  // was previously colour-blind to growth state). Pure so the paint rule is
  // pinned independently of the SVG render.
  describe('nodePaint', () => {
    const shaky = concept('a', 'Photosynthesis', {
      growthEdge: { edgeId: 'g1', conceptKey: 'photosynthesis', strength: 0.8 },
    });
    const remediate = concept('b', 'Ratios', { intent: 'remediate' });
    const mastered = concept('c', 'Addition', { mastered: true });
    const plain = concept('d', 'Nouns');

    it('is null in Explore + Familiar (structure view — no growth emphasis)', () => {
      for (const lens of ['explore', 'familiar'] as const) {
        expect(nodePaint(lens, shaky)).toBeNull();
        expect(nodePaint(lens, mastered)).toBeNull();
        expect(nodePaint(lens, remediate)).toBeNull();
      }
    });

    it('Growth reads an evidenced growthEdge OR a remediate intent as shaky', () => {
      expect(nodePaint('growth', shaky)).toBe('shaky');
      expect(nodePaint('growth', remediate)).toBe('shaky'); // model: folds in
      expect(nodePaint('growth', mastered)).toBeNull();
      expect(nodePaint('growth', plain)).toBeNull();
    });

    it('Mastery reads a mastered concept as mastered (and nothing else)', () => {
      expect(nodePaint('mastery', mastered)).toBe('mastered');
      expect(nodePaint('mastery', shaky)).toBeNull();
      expect(nodePaint('mastery', remediate)).toBeNull();
    });

    it('is null for an unknown/absent node (fail-soft)', () => {
      expect(nodePaint('growth', undefined)).toBeNull();
    });
  });

  // The lens-independent "shaky" predicate behind the FAINT always-on cue
  // (map-canvas §5: shaky cues stay faintly on in every lens; Growth then
  // intensifies to the bold paint). Same rule `nodePaint` uses under Growth.
  describe('isShakyNode', () => {
    it('is true for an evidenced growthEdge OR a remediate intent', () => {
      expect(
        isShakyNode(
          concept('a', 'Photosynthesis', {
            growthEdge: { edgeId: 'g', conceptKey: 'photosynthesis', strength: 0.5 },
          }),
        ),
      ).toBe(true);
      expect(isShakyNode(concept('b', 'Ratios', { intent: 'remediate' }))).toBe(true);
    });

    it('is false for mastered / explore-intent / plain / absent', () => {
      expect(isShakyNode(concept('c', 'Addition', { mastered: true }))).toBe(false);
      expect(isShakyNode(concept('d', 'Comets', { intent: 'explore' }))).toBe(false);
      expect(isShakyNode(concept('e', 'Nouns'))).toBe(false);
      expect(isShakyNode(undefined)).toBe(false);
    });
  });

  // The Ebbinghaus "due for review" predicate behind the distinct amber cue —
  // orthogonal to shaky heat (a due node is always shaky, but not vice-versa).
  describe('isDueNode', () => {
    it('is true only when the growthEdge is flagged due', () => {
      expect(
        isDueNode(
          concept('a', 'X', {
            growthEdge: { edgeId: 'e', conceptKey: 'x', strength: 0.5, isDue: true },
          }),
        ),
      ).toBe(true);
    });

    it('is false for a not-due growthEdge / remediate / plain / absent', () => {
      expect(
        isDueNode(
          concept('b', 'Y', { growthEdge: { edgeId: 'e', conceptKey: 'y', strength: 0.5 } }),
        ),
      ).toBe(false);
      expect(isDueNode(concept('c', 'Z', { intent: 'remediate' }))).toBe(false);
      expect(isDueNode(concept('d', 'W'))).toBe(false);
      expect(isDueNode(undefined)).toBe(false);
    });
  });

  // The always-on campaign overlay classifier (WS-C7, ADR-227 D15): fog →
  // frontier (claimed/climbing/cooling) → province (won). Pure so the map-state
  // rule is pinned independently of the SVG chrome that renders it.
  describe('campaignHexState', () => {
    const state = (over: Partial<CampaignNodeState> = {}): CampaignNodeState => ({
      rungsCleared: 0,
      currentRungCorrect: 0,
      cooling: false,
      advancedToday: false,
      ...over,
    });

    it('is null when the map has NO campaign (chrome renders nothing)', () => {
      expect(campaignHexState(undefined, false)).toBeNull();
      // Even a climbing row paints no chrome when the map has no campaign block.
      expect(campaignHexState(state({ rungsCleared: 3 }), false)).toBeNull();
    });

    it('is frontier for an ABSENT per-node state in a campaign (unstarted)', () => {
      expect(campaignHexState(undefined, true)).toBe('frontier');
    });

    it('is frontier for a present-but-zero row (claimed, no rungs yet)', () => {
      expect(campaignHexState(state({ rungsCleared: 0 }), true)).toBe('frontier');
    });

    it('is frontier-climbing when rungs are cleared and not cooling/won', () => {
      expect(campaignHexState(state({ rungsCleared: 2 }), true)).toBe(
        'frontier-climbing',
      );
    });

    it('is frontier-cooling when climbing AND retention has gone cold', () => {
      expect(
        campaignHexState(state({ rungsCleared: 2, cooling: true }), true),
      ).toBe('frontier-cooling');
    });

    it('is province once won — even mid-climb or cooling (wonAt wins)', () => {
      expect(
        campaignHexState(
          state({ rungsCleared: 6, wonAt: '2026-07-10T00:00:00Z' }),
          true,
        ),
      ).toBe('province');
      expect(
        campaignHexState(
          state({ rungsCleared: 3, cooling: true, wonAt: '2026-07-10T00:00:00Z' }),
          true,
        ),
      ).toBe('province');
    });
  });

  // The province held-count badge feed: how many WON hierarchy-descendants a
  // conquered node holds beneath it (source parent → target child; cycle-safe).
  describe('wonDescendantCount', () => {
    const won = (): CampaignNodeState => ({
      rungsCleared: 6,
      currentRungCorrect: 0,
      cooling: false,
      advancedToday: false,
      wonAt: '2026-07-10T00:00:00Z',
    });
    const unwon = (): CampaignNodeState => ({
      rungsCleared: 1,
      currentRungCorrect: 0,
      cooling: false,
      advancedToday: false,
    });

    it('counts won hierarchy-descendants (never the node itself, never unwon)', () => {
      const edges = [
        edge('e1', 'root', 'a'),
        edge('e2', 'root', 'b'),
        edge('e3', 'a', 'c'),
      ];
      const nodes = { root: won(), a: won(), b: unwon(), c: won() };
      expect(wonDescendantCount('root', edges, nodes)).toBe(2); // a + c (not b, not root)
      expect(wonDescendantCount('a', edges, nodes)).toBe(1); // c
      expect(wonDescendantCount('c', edges, nodes)).toBe(0); // leaf
    });

    it('ignores lateral edges (hierarchy descent only)', () => {
      const edges = [edge('e1', 'root', 'a', 'lateral')];
      const nodes = { root: won(), a: won() };
      expect(wonDescendantCount('root', edges, nodes)).toBe(0);
    });

    it('is cycle-safe: a hierarchy back-edge terminates without double-count', () => {
      const edges = [
        edge('e1', 'a', 'b'),
        edge('e2', 'b', 'c'),
        edge('e3', 'c', 'a'), // back-edge → cycle
      ];
      const nodes = { a: won(), b: won(), c: won() };
      expect(wonDescendantCount('a', edges, nodes)).toBe(2); // b + c; back to a ignored
    });

    it('does not count a descendant with no campaign row', () => {
      const edges = [edge('e1', 'root', 'a')];
      const nodes = { root: won() }; // a has no row
      expect(wonDescendantCount('root', edges, nodes)).toBe(0);
    });
  });
});

describe('fog-ghost hex slots (freeFogSlots / fogSlotAngle)', () => {
  it('slot 0 points straight up; there are six slots', () => {
    expect(fogSlotAngle(0)).toBeCloseTo(-Math.PI / 2);
    expect(FOG_SLOT_COUNT).toBe(6);
  });

  it('with no real neighbours every slot 0..5 is free', () => {
    expect(freeFogSlots({ x: 0, y: 0 }, [])).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('skips the slot a claimed child (directly above) occupies', () => {
    // SVG y grows downward → a child ABOVE the focal sits at -90° = slot 0.
    const free = freeFogSlots({ x: 0, y: 0 }, [{ x: 0, y: -100 }]);
    expect(free).not.toContain(0);
    expect(free).toHaveLength(5);
  });

  it('skips every slot a claimed child sits in (two children, opposite dirs)', () => {
    // Regression: the old top-start fan drew a ghost under the claimed child at
    // the top. The caller passes CHILDREN only (never the parent).
    const free = freeFogSlots({ x: 500, y: 292 }, [
      { x: 500, y: 138 }, // a claimed child, above → slot 0 (top)
      { x: 500, y: 446 }, // a claimed child, below → slot 3 (bottom)
    ]);
    expect(free).not.toContain(0);
    expect(free).not.toContain(3);
    expect(free).toEqual([1, 2, 4, 5]);
  });

  it('snaps an off-axis neighbour to its nearest of the six slots', () => {
    // upper-right (dx>0, dy<0) → nearest slot 1 (-30°)
    const free = freeFogSlots({ x: 0, y: 0 }, [{ x: 86, y: -50 }]);
    expect(free).not.toContain(1);
    expect(free).toHaveLength(5);
  });
});
