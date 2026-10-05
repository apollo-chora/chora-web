/**
 * Concept-key normalisation ("My Knowledge" unification — WS-D Growth lens).
 *
 * The learner's Growth Edges key by `concept_key`, a normalised slug of the
 * weak concept's label. To surface a concept's growth diagnosis in the Growth
 * lens we join a `ConceptNode` to its Growth Edge by slugifying the concept
 * TITLE the same way — lowercase, trim, and collapse every run of
 * whitespace/punctuation/symbols to a single hyphen (edges stripped).
 *
 * Pure + framework-free so it is trivially unit-tested and reusable by the
 * Familiar lens (WS-E). NB: a node that already carries a painted
 * `growthEdge.conceptKey` (WS-A1) should prefer that authoritative key; this
 * slug is the fallback when the overlay is absent.
 */
export function normalizeConceptKey(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
