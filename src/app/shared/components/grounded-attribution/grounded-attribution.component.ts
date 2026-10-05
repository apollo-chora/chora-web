/**
 * GroundedAttributionComponent — everything a learner is owed when a Companion
 * shows them output it got off the live web (ADR-231 D4/D5, ADR-225, IMDA D2).
 *
 * ⚠ THIS IS THE ONLY PLACE IN THE SPA THAT MAY CALL `bypassSecurityTrustHtml`
 * ON VENDOR HTML. Google's Grounding-with-Google-Search Service Terms require
 * that `searchEntryPoint.renderedContent` be displayed VERBATIM — we may not
 * restyle it, re-wrap it, or strip it (ADR-231 D5: "a hard requirement, not
 * cosmetic"). That forces a deliberate XSS-boundary exception. An exception
 * that gets copy-pasted per surface is an exception nobody reviews, so it lives
 * here, once. Every surface showing grounded output composes THIS component.
 *
 * It renders three distinct channels, and the distinction is load-bearing:
 *
 *   SOURCES   The citations, named by `domain` and linked by `url`. The domain
 *             is the DURABLE identity; the url is a Google grounding-api-redirect
 *             that EXPIRES (~30 days, D4). Naming a source by its url — which is
 *             what happened before CHO-2179, via the `domain || url` fallback —
 *             means the learner's only handle on it dies with the link.
 *
 *   SEARCHED  The web_search_queries the model actually issued. Plain strings;
 *             they never expire. ⚠ TRANSPARENCY METADATA, NEVER KNOWLEDGE — the
 *             contract is explicit. They answer "what did you search?", never
 *             "what is true?", so they render small + secondary + labelled,
 *             deliberately unlike the answer they sit beneath.
 *
 *   CHIP      Google's HTML, untouched.
 *
 * NO FABRICATION. Each channel renders only when the vendor actually supplied
 * it, and the whole block renders nothing at all when none did — an empty husk
 * would imply a search that never happened.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';

import { TranslatePipe } from '../../pipes/translate.pipe';
import type { SeekerCitation } from '../../../core/familiar/familiar-growth.model';

@Component({
  selector: 'chora-grounded-attribution',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  templateUrl: './grounded-attribution.component.html',
  styleUrl: './grounded-attribution.component.scss',
})
export class GroundedAttributionComponent {
  private readonly sanitizer = inject(DomSanitizer);

  /** The grounded sources behind the answer (IMDA D2 citation mandate). */
  readonly citations = input<readonly SeekerCitation[]>([]);

  /** Google's Search-Suggestions chip HTML — rendered verbatim, or not at all. */
  readonly searchEntryPointHtml = input<string>('');

  /** The queries the model actually issued — the durable "what I searched". */
  readonly webSearchQueries = input<readonly string[]>([]);

  /**
   * The chip as trusted HTML.
   *
   * `bypassSecurityTrustHtml` is a knowing exception to Angular's XSS boundary.
   * It is justified ONLY here and ONLY for this value: Google's ToS forbids us
   * altering the markup, and Angular's sanitiser would strip the `<style>` block
   * and the anchors the chip is made of. The input is Google's own compliant
   * HTML, delivered over the governed egress (chora-model-gateway) — it is not
   * learner-supplied and never passes through a user-writable field.
   *
   * null ⇒ no chip element is rendered at all (never an empty container).
   */
  readonly chip = computed<SafeHtml | null>(() => {
    const html = this.searchEntryPointHtml();
    return html ? this.sanitizer.bypassSecurityTrustHtml(html) : null;
  });

  /**
   * Whether ANY grounded channel is present. Drives the whole block — including
   * the ADR-225 disclosure, which discloses a live web search and must therefore
   * appear if and only if there was one to disclose.
   */
  readonly hasGroundedOutput = computed(
    () =>
      this.citations().length > 0 ||
      this.webSearchQueries().length > 0 ||
      this.searchEntryPointHtml() !== '',
  );

  /**
   * The source's headline — SUPPRESSED when it merely repeats the domain.
   *
   * A Vertex grounding chunk's `title` is very often just the SITE NAME
   * ("aai.org", "wikipedia.org"), identical to `domain`. Rendering "domain —
   * title" verbatim therefore printed the domain TWICE, which reads to a learner
   * as a rendering bug rather than a citation.
   *
   * ⚠ This suppresses the RENDER, never the DATA. The title stays on the wire and
   * in the persisted provenance, because for other chunks it genuinely IS an
   * article headline — and that is worth keeping.
   *
   * Found only on the live walk: every unit-test fixture used a real headline,
   * so nothing red-flagged it.
   */
  headlineFor(c: SeekerCitation): string {
    const title = (c.title ?? '').trim();
    if (title === '') return '';
    const domain = (c.domain ?? '').trim();
    return title.toLowerCase() === domain.toLowerCase() ? '' : title;
  }

  /**
   * Whether this source can be linked at all.
   *
   * A citation replayed from a PERSISTED research note has no url (CHO-2185):
   * the redirect uri expires in ~30 days and was deliberately never stored, so
   * there is genuinely nothing to point at. The template renders those as text.
   *
   * ⚠ Do not "fix" this by falling back to some other url. An anchor with an
   * empty href resolves to the current page — a source that looks clickable and
   * goes nowhere is exactly the dead link D4 exists to prevent, and it is worse
   * than no link, because it looks like it works.
   */
  hasLink(c: SeekerCitation): boolean {
    return (c.url ?? '').trim() !== '';
  }

  /**
   * The learner's handle on the source. The DOMAIN is the durable identity; the
   * url is only a fallback for a live citation that somehow arrived without one.
   */
  sourceName(c: SeekerCitation): string {
    return (c.domain ?? '').trim() || (c.url ?? '').trim();
  }
}
