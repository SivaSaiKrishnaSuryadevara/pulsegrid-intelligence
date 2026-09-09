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
      'What kind of South Asian event-production entity this account is, if any: solo_creator ' +
        '(content creator/influencer), stage_emcee (live mic host/anchor), dance_troupe (dance ' +
        'studio/academy/performance group/choreographer), local_dj (DJ/sound engineer), or ' +
        'event_planner (decorator/coordinator/producer). null if this is NOT an event professional at ' +
        'all — most accounts you will see are genuinely unrelated (a restaurant, retail shop, personal ' +
        'account, unrelated business); return null for those rather than forcing a guess.'
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
        'pass already rejected this account as having no obvious signal — you are the harder-case ' +
        'fallback for unusual phrasing, not a second chance to be generous. Most accounts you see ' +
        'genuinely are NOT event professionals; return null for those rather than forcing a guess.',
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
