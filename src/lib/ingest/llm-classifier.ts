/**
 * Fallback entity-type classification for the specific handles
 * `inferEntityType` (apify-instagram-parser.ts) rejects under strict mode —
 * NOT a replacement for it. The deterministic keyword classifier stays the
 * first pass for every discovered handle: free, instant, and already tuned
 * against real production data this session (position-based tie-breaking,
 * Unicode-normalized bios, phrase-specific rules per entity type). This
 * module only runs against the subset it couldn't resolve, so a typical
 * discovery run — most of which are genuinely unrelated businesses — costs
 * one Claude call per REJECTED handle, not per discovered handle.
 *
 * A separate, unused route (`/api/webhooks/apify-discovery/route.ts`)
 * already implements full LLM classification (entity type + metro + niche +
 * rate range + deliverability) for every new handle unconditionally — that
 * route isn't wired to any live Apify webhook and was built for a different
 * request shape (raw items in the POST body, not a datasetId). This module
 * is deliberately narrower: entity type only, fallback only, reusing that
 * route's established SDK pattern (`messages.parse` + `zodOutputFormat`).
 */

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

import { ENTITY_TYPES, type EntityType } from '@/types/creator';

const anthropic = new Anthropic();

const FallbackClassificationSchema = z.object({
  entityType: z
    .enum(ENTITY_TYPES)
    .nullable()
    .describe(
      'What kind of South Asian/Desi event-production entity this account is, if any. TWO conditions ' +
        'must BOTH hold — this is an AND, not an either/or — or the answer is null:\n' +
        '(1) Role: the account itself is personally bookable/hireable for the role, not merely ' +
        'discussing or covering it: solo_creator (an individual who personally creates and posts ' +
        'sponsored/branded content — their bio says so, e.g. "content creator," "influencer," "brand ' +
        'partnerships"), stage_emcee (an individual live mic host/anchor available to hire), dance_troupe ' +
        '(a specific dance studio/academy/performance group/choreographer offering performances), ' +
        'local_dj (an individual DJ/sound engineer offering their own DJ services), or event_planner (a ' +
        'specific decorator/coordinator/production company offering event-planning services).\n' +
        '(2) Cultural relevance (REQUIRED, not a bonus point): clear South Asian/Desi diaspora context in ' +
        'the bio, stated performance niche, or visible content — e.g. Bollywood, Tollywood, Bhangra, ' +
        'Punjabi, Garba, Sangeet, Desi, South Asian weddings, diaspora culture, or a regional Indian/South ' +
        'Asian language (Hindi, Telugu, Tamil, Gujarati, Urdu, Punjabi, Malayalam, Kannada, Marathi, ' +
        'Bengali). A mainstream/generic DJ, emcee, wedding planner, or dance instructor with NO such ' +
        'signal is null even though they are a real, legitimate event professional — they are simply not ' +
        'this directory\'s niche.\n' +
        'null covers all of: genuinely unrelated accounts (a restaurant, retail shop, personal account, ' +
        'unrelated business), a community page / local media outlet / city guide / classifieds platform ' +
        'that talks ABOUT events without being one itself, AND a real event professional who fails the ' +
        'cultural-relevance test. Return null rather than forcing a guess on any of these.'
    ),
});

/**
 * Returns the LLM's entity-type judgment, or null if it also finds no real
 * signal (or the call fails — this is a best-effort enhancement, not a
 * required step; a failure here should never block ingestion).
 */
export async function classifyEntityTypeFallback(displayName: string, bio: string): Promise<EntityType | null> {
  try {
    const response = await anthropic.messages.parse({
      model: 'claude-opus-5',
      max_tokens: 1024,
      system:
        'You classify Instagram accounts for a South Asian (Desi) event-production directory covering ' +
        'DJs, dance troupes, stage emcees, event planners, and content creators. A keyword-based first ' +
        'pass already rejected this account as having no obvious signal on EITHER of the two gates below ' +
        '— you are the harder-case fallback for unusual phrasing, not a second chance to be generous. ' +
        'Most accounts you see genuinely fail one or both gates; return null for those rather than ' +
        'forcing a guess.\n\n' +
        'Gate 1 — role: the bar is "personally bookable for this role," not "posts content related to ' +
        'this topic" — a local events guide, community page, or aggregator account is not a solo_creator ' +
        'just because it posts about events and culture; it has to be an individual/business personally ' +
        'offering that service.\n\n' +
        'Gate 2 — South Asian/Desi cultural relevance, REQUIRED, independent of gate 1: this directory ' +
        'exists for the South Asian diaspora market specifically, not the general wedding/nightlife ' +
        'industry. A mainstream American wedding DJ, a general bar/trivia emcee, or a generic event ' +
        'planner with zero Bollywood/Tollywood/Bhangra/Punjabi/Garba/Sangeet/Desi/South Asian-wedding/ ' +
        'diaspora/regional-Indian-language signal in their bio or stated niche is null — being a real, ' +
        'legitimate event professional is not enough on its own. Both gates must pass for a non-null ' +
        'answer.',
      messages: [{ role: 'user', content: `Display name: ${displayName}\nBio: ${bio}` }],
      output_config: { format: zodOutputFormat(FallbackClassificationSchema) },
    });

    if (!response.parsed_output) return null;
    return response.parsed_output.entityType;
  } catch {
    return null;
  }
}

const FALLBACK_CONCURRENCY = 5;
/**
 * Hard cap on LLM calls per discovery run, independent of how many handles
 * the deterministic pass rejects. Most rejects are genuinely correct
 * rejects (unrelated businesses) — this bounds worst-case Claude spend for
 * a single run rather than scaling 1:1 with an unusually noisy hashtag
 * batch. Raise it if MAX_DISCOVERED_HANDLES (discover/route.ts) changes.
 */
const MAX_FALLBACK_CALLS_PER_RUN = 25;

export interface FallbackClassifyTarget {
  handle: string;
  displayName: string;
  bio: string;
}

/**
 * Bounded-concurrency batch wrapper. Returns a Map from `handle` to the
 * LLM's entityType judgment — entries are only present for handles that
 * were actually sent to the LLM (the first MAX_FALLBACK_CALLS_PER_RUN),
 * and only carry a non-null value when the LLM found real signal.
 */
export async function classifyEntityTypesFallbackBatch(
  targets: FallbackClassifyTarget[]
): Promise<Map<string, EntityType | null>> {
  const capped = targets.slice(0, MAX_FALLBACK_CALLS_PER_RUN);
  const results = new Map<string, EntityType | null>();
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < capped.length) {
      const current = capped[cursor++];
      if (!current) continue;
      results.set(current.handle, await classifyEntityTypeFallback(current.displayName, current.bio));
    }
  }

  const workerCount = Math.max(1, Math.min(FALLBACK_CONCURRENCY, capped.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
