/**
 * PricingPageComponent — Public-facing plans and pricing page with composable
 * add-on catalog, interactive pricing calculator, and feature comparison matrix.
 *
 * Route: /pricing (public, no auth required)
 */
import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
} from '@angular/core';
import { Router } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';

interface AddOnPlan {
  code: string;
  name: string;
  description: string;
  price_monthly: number;
  features: string[];
  category: string;
}

const ADD_ON_CATALOG: AddOnPlan[] = [
  {
    code: 'knowledge_graph',
    name: 'pricing.addon_knowledge_graph',
    description: 'pricing.addon_knowledge_graph_desc',
    price_monthly: 29,
    features: ['pricing.feature_graph_discovery', 'pricing.feature_topic_map', 'pricing.feature_prerequisite_engine'],
    category: 'pricing.category_learning',
  },
  {
    code: 'choraverse',
    name: 'pricing.addon_choraverse',
    description: 'pricing.addon_choraverse_desc',
    price_monthly: 19,
    features: ['pricing.feature_familiar_companion', 'pricing.feature_trading_cards', 'pricing.feature_duels'],
    category: 'pricing.category_engagement',
  },
  {
    code: 'governance_trust',
    name: 'pricing.addon_governance',
    description: 'pricing.addon_governance_desc',
    price_monthly: 49,
    features: ['pricing.feature_ai_governance', 'pricing.feature_audit_trail', 'pricing.feature_explainability'],
    category: 'pricing.category_admin',
  },
  {
    code: 'exam_management',
    name: 'pricing.addon_exam',
    description: 'pricing.addon_exam_desc',
    price_monthly: 39,
    features: ['pricing.feature_exam_scheduling', 'pricing.feature_proctoring', 'pricing.feature_exam_analytics'],
    category: 'pricing.category_assessment',
  },
  {
    code: 'classroom',
    name: 'pricing.addon_classroom',
    description: 'pricing.addon_classroom_desc',
    price_monthly: 25,
    features: ['pricing.feature_live_quiz', 'pricing.feature_attendance', 'pricing.feature_timetable'],
    category: 'pricing.category_learning',
  },
  {
    code: 'work_based_learning',
    name: 'pricing.addon_wbl',
    description: 'pricing.addon_wbl_desc',
    price_monthly: 35,
    features: ['pricing.feature_placement_tracking', 'pricing.feature_mentor_log', 'pricing.feature_competency_map'],
    category: 'pricing.category_learning',
  },
  {
    code: 'marketplace',
    name: 'pricing.addon_marketplace',
    description: 'pricing.addon_marketplace_desc',
    price_monthly: 45,
    features: ['pricing.feature_billing', 'pricing.feature_subscriptions', 'pricing.feature_revenue_share'],
    category: 'pricing.category_commerce',
  },
  {
    code: 'byoa_model_broker',
    name: 'pricing.addon_byoa',
    description: 'pricing.addon_byoa_desc',
    price_monthly: 59,
    features: ['pricing.feature_model_registry', 'pricing.feature_ab_testing', 'pricing.feature_cost_tracking'],
    category: 'pricing.category_ai',
  },
  {
    code: 'a2a_gateway',
    name: 'pricing.addon_a2a',
    description: 'pricing.addon_a2a_desc',
    price_monthly: 79,
    features: ['pricing.feature_agent_interop', 'pricing.feature_skill_exchange', 'pricing.feature_partner_agents'],
    category: 'pricing.category_ai',
  },
];

@Component({
  selector: 'chora-pricing-page',
  standalone: true,
  imports: [TranslatePipe, DecimalPipe],
  templateUrl: './pricing-page.component.html',
  styleUrl: './pricing-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PricingPageComponent {
  private readonly router = inject(Router);

  // --- State ---
  readonly selectedAddOns = signal<Set<string>>(new Set());
  readonly showComparison = signal(false);

  // --- Constants ---
  readonly catalog = ADD_ON_CATALOG;
  readonly basePriceMonthly = 0;

  // --- Computed ---
  readonly totalMonthly = computed(() => {
    const selected = this.selectedAddOns();
    let total = this.basePriceMonthly;
    for (const addOn of this.catalog) {
      if (selected.has(addOn.code)) {
        total += addOn.price_monthly;
      }
    }
    return total;
  });

  readonly selectedCount = computed(() => this.selectedAddOns().size);

  readonly allFeatures = computed(() => {
    const features = new Set<string>();
    for (const addOn of this.catalog) {
      for (const feature of addOn.features) {
        features.add(feature);
      }
    }
    return [...features];
  });

  // ---------------------------------------------------------------------------
  // Interaction
  // ---------------------------------------------------------------------------

  toggleAddOn(code: string): void {
    this.selectedAddOns.update((current) => {
      const next = new Set(current);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  }

  isSelected(code: string): boolean {
    return this.selectedAddOns().has(code);
  }

  toggleComparison(): void {
    this.showComparison.update((v) => !v);
  }

  hasFeature(addOn: AddOnPlan, feature: string): boolean {
    return addOn.features.includes(feature);
  }

  getStarted(): void {
    this.router.navigate(['/register']);
  }

  trackByCode(_index: number, addOn: AddOnPlan): string {
    return addOn.code;
  }

  trackByFeature(_index: number, feature: string): string {
    return feature;
  }
}
