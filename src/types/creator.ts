/**
 * PulseGrid Intelligence — Core Domain Types
 *
 * 1:1 TypeScript mirror of the enums and tables defined in
 * `supabase/migrations/001_init.sql`, plus the composite/UI models the app
 * layer builds on top of them.
 *
 * Enum unions are derived from `as const` arrays rather than declared as
 * bare string-literal unions so the same array can double as a runtime
 * validation / `<Select>` options source (see src/workers/ingest-worker.ts)
 * without the array and the type ever drifting apart.
 */

// =====================================================================================
// 1. ENUM UNIONS (1:1 with the Postgres enum types)
// =====================================================================================

export const METRO_HUBS = [
  'DFW_TEXAS',
  'DMV_NOVA',
  'AUSTIN_TX',
  'HOUSTON_TX',
  'TRI_STATE_NY_NJ',
  'ATLANTA_GA',
  'CHICAGO_IL',
  'CLT_CAROLINAS',
] as const;
export type MetroHub = (typeof METRO_HUBS)[number];

export const PRIMARY_NICHES = [
  'CULTURAL_EVENTS',
  'NIGHTLIFE',
  'LUXURY_BRIDAL',
  'STAGE_EMCEE',
  'FOOD_DINING',
  'CHOREOGRAPHY',
] as const;
export type PrimaryNiche = (typeof PRIMARY_NICHES)[number];

export const BOOKING_STATUSES = [
  'available_immediate',
  'high_demand_lead',
  'blackout_period',
  'closed_roster',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const REP_TYPES = [
  'DIRECT_MANAGER',
  'TALENT_AGENCY',
  'SELF_REPRESENTED',
  'UNVERIFIED_BIO',
] as const;
export type RepType = (typeof REP_TYPES)[number];

export const ENTERPRISE_TYPES = [
  'NIGHTLIFE_PROMOTER',
  'CONVENTION_BOARD',
  'WEDDING_PRODUCER',
  'CONCERT_ORGANIZER',
] as const;
export type EnterpriseType = (typeof ENTERPRISE_TYPES)[number];

export const COMMITTEE_ROLES = ['CHAIR', 'REVIEWER', 'GUEST_OBSERVER'] as const;
export type CommitteeRole = (typeof COMMITTEE_ROLES)[number];

export const TALENT_STAGE_STATUSES = [
  'SUBMITTED',
  'SHORTLISTED',
  'APPROVED_FOR_BOOKING',
  'REJECTED',
] as const;
export type TalentStageStatus = (typeof TALENT_STAGE_STATUSES)[number];

export const SUBSCRIPTION_TIERS = [
  'FREE_TRIAL',
  'STARTER',
  'AGENCY_PRO',
  'ENTERPRISE_DAAS',
] as const;
export type SubscriptionTier = (typeof SUBSCRIPTION_TIERS)[number];

/**
 * 1:1 with the Postgres `entity_type` enum (migration 006). Orthogonal to
 * `PrimaryNiche` — `STAGE_EMCEE` exists in both, as a historical niche tag
 * here and as its own entity type below; a row's `entityType` drives
 * type-specific UI/filtering, `primaryNiche` still just describes content
 * focus.
 */
export const ENTITY_TYPES = [
  'solo_creator',
  'stage_emcee',
  'dance_troupe',
  'local_dj',
  'event_planner',
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

// =====================================================================================
// 2. SHARED PRIMITIVES
// =====================================================================================

/** ISO 8601 timestamp, e.g. the output of `new Date().toISOString()`. */
export type Timestamp = string;

/** ISO 8601 calendar date only, formatted `YYYY-MM-DD`. */
export type DateOnly = string;

/** Postgres UUID, represented as a string on the TS side. */
export type UUID = string;

// =====================================================================================
// 3. ENTITY INTERFACES (1:1 with database tables)
// =====================================================================================

/**
 * Type-specific fields per `EntityType`, stored in `production_entities.entity_details`
 * (jsonb, migration 006). `kind` deliberately duplicates the parent row's `entityType` —
 * a small denormalization that buys TS narrowing (`entityDetails.kind === 'local_dj'`)
 * without a second lookup. Enforced by Zod at ingestion (see the ingest worker /
 * apify-discovery webhook), not by a DB constraint — jsonb has no structural typing.
 */
/**
 * A single scraped post's thumbnail, kept for the card's visual-proof strip.
 * `playCount` is null for photo posts (Instagram only reports play counts
 * for video/reel content).
 */
export interface MediaProof {
  displayUrl: string;
  shortCode: string;
  playCount: number | null;
}

export interface DanceTroupeDetails {
  kind: 'dance_troupe';
  troupeSize: number;
  /** e.g. "Bollywood Fusion", "Bharatanatyam", "Garba/Raas". */
  style: string;
  stageRiderNotes?: string;
  honorariumNote?: string;
  mediaProofs?: MediaProof[];
}

export interface LocalDjDetails {
  kind: 'local_dj';
  avSpecNotes: string;
  maxCapacity: number;
  setLengthMinutes: number;
  rigSpecNotes?: string;
  /** e.g. "Tollywood Mass", "Bollywood", "EDM". */
  genreTags: string[];
  mediaProofs?: MediaProof[];
}

export interface EventPlannerDetails {
  kind: 'event_planner';
  venueScaleBracket: 'boutique' | 'mid_scale' | 'grand';
  /** 0–100. */
  permitRating?: number;
  portfolioUrl?: string;
  mediaProofs?: MediaProof[];
}

/** solo_creator and stage_emcee carry no type-specific fields today. */
export interface GenericEntityDetails {
  kind: 'solo_creator' | 'stage_emcee';
  mediaProofs?: MediaProof[];
}

export type EntityDetails = DanceTroupeDetails | LocalDjDetails | EventPlannerDetails | GenericEntityDetails;

export interface CreatorProfile {
  id: UUID;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  entityType: EntityType;
  entityDetails: EntityDetails;
  primaryMetro: MetroHub;
  primaryNiche: PrimaryNiche;
  secondaryLanguages: string[];
  /** Percentage, 0–100, two decimal places (matches NUMERIC(4,2)). */
  /** Instagram follower count as of lastRefreshedAt. Added in migration 002. */
  followerCount: number | null;
  engagementRate: number | null;
  avgReelViews: number | null;
  estMinimumRateUsd: number | null;
  estMaximumRateUsd: number | null;
  bookingStatus: BookingStatus;
  leadTimeDays: number | null;
  verifiedResponseHours: number | null;
  repType: RepType;
  directBookingEmail: string | null;
  directBookingPhone: string | null;
  /** Public link-in-bio URL — unlike the two fields above, not unlock-gated (see discover/queries.ts). */
  publicLinkUrl: string | null;
  /** Raw scraped bio text — used for Discover's quick-search substring match; not otherwise rendered. */
  bio: string | null;
  /** Specific suburb/city display name (e.g. "Ashburn, VA") from the suburb-to-metro normalizer — distinct from primaryMetro, the parent hub used for filtering. Null falls back to the metro's short label on the card badge. */
  locality: string | null;
  /** 0–100 composite score reflecting how reliably outreach reaches the creator. */
  deliverabilityScore: number | null;
  isVerified: boolean;
  lastRefreshedAt: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CreatorCategoryBlackout {
  id: UUID;
  creatorId: UUID;
  brandName: string;
  categorySlug: string;
  blackoutStartDate: DateOnly;
  blackoutEndDate: DateOnly;
  createdAt: Timestamp;
}

export interface EventEnterprise {
  id: UUID;
  businessName: string;
  instagramHandle: string;
  metroHub: MetroHub;
  enterpriseType: EnterpriseType;
  publicEmail: string | null;
  phoneNumber: string | null;
  ticketingUrl: string | null;
  frequentVenues: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PromoterCreatorBooking {
  id: UUID;
  enterpriseId: UUID;
  creatorId: UUID;
  eventName: string;
  eventDate: DateOnly;
  createdBy: UUID | null;
  createdAt: Timestamp;
}

export interface CommitteeWorkspace {
  id: UUID;
  name: string;
  slug: string;
  ownerId: UUID;
  eventDate: DateOnly | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CommitteeMember {
  id: UUID;
  workspaceId: UUID;
  profileId: UUID;
  role: CommitteeRole;
  createdAt: Timestamp;
}

export interface CommitteeSubmission {
  id: UUID;
  workspaceId: UUID;
  creatorId: UUID;
  auditionReelUrl: string | null;
  stageStatus: TalentStageStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CommitteeVote {
  id: UUID;
  submissionId: UUID;
  memberId: UUID;
  /** 1–5 */
  dialectFitScore: number;
  /** 1–5 */
  stagePresenceScore: number;
  /** 1–5 */
  deliveryScore: number;
  internalNotes: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// =====================================================================================
// 4. COMPOSITE & UI MODELS
// =====================================================================================

/** A single active brand/category exclusivity window, as surfaced on a creator card. */
export interface ActiveBlackoutSummary {
  brandName: string;
  categorySlug: string;
  endDate: DateOnly;
}

/**
 * `CreatorProfile` plus the derived fields the directory UI needs to render a
 * card without re-deriving them client-side on every render.
 */
export interface CreatorCardModel extends CreatorProfile {
  activeBlackouts: ActiveBlackoutSummary[];
  /** True when bookingStatus is 'available_immediate' AND no active blackout applies. */
  isAvailableNow: boolean;
  /** Distinct brand names the creator has disclosed sponsorships for recently. */
  recentSponsors: string[];
}

export type AvailabilityFilter = 'all' | 'immediate_only' | 'exclude_closed';

/** Search/facet state for the creator directory (mirrors the Typesense query). */
export interface FilterCriteria {
  searchQuery: string;
  /** Empty array = "All Production" (no entity-type restriction). */
  selectedEntityTypes: EntityType[];
  selectedMetros: MetroHub[];
  selectedNiches: PrimaryNiche[];
  /** "Desk Status" filter chip — direct-managed/agency desks vs. self-represented. */
  selectedRepTypes: RepType[];
  secondaryLanguages: string[];
  /** Minimum engagement rate, percentage points (0–100), or null for no floor. */
  minER: number | null;
  /** Maximum engagement rate, percentage points (0–100), or null for no ceiling. */
  maxER: number | null;
  /** When true, exclude creators with an active category blackout from results. */
  hideConflicts: boolean;
  availabilityFilter: AvailabilityFilter;
  /**
   * Entity-specific sub-filter values, read against `entityDetails` at
   * filter time (see `matchesFilters`). Kept as one small optional bag
   * rather than a field per entity type — only `dance_troupe`/
   * `event_planner` need a dedicated value today; `local_dj`'s genre
   * filter reuses `secondaryLanguages` (the filter-strip swaps its option
   * list to genre tags for that entity type, same underlying field).
   */
  entityDetailFilters: {
    minTroupeSize: number | null;
    venueScaleBracket: EventPlannerDetails['venueScaleBracket'] | null;
    /** Full Sound + Stage Lighting Included (true) vs. Console Only (false); null = no filter. */
    avSpecIncluded: boolean | null;
  };
}

/**
 * Response payload returned when an agency spends 1 contact-unlock credit to
 * reveal a creator's direct representation details. Modeled as a
 * discriminated union so callers must branch on `success` before touching
 * `contact`, rather than defensively null-checking every field.
 */
export type ContactUnlockPayload =
  | {
      success: true;
      creatorId: UUID;
      unlockedAt: Timestamp;
      /** contact_unlocks_remaining on the acting profile, after this spend. */
      creditsRemaining: number;
      contact: {
        repType: RepType;
        directBookingEmail: string | null;
        directBookingPhone: string | null;
        deliverabilityScore: number | null;
      };
    }
  | {
      success: false;
      creatorId: UUID;
      reason: 'INSUFFICIENT_CREDITS' | 'ALREADY_UNLOCKED' | 'CREATOR_NOT_FOUND';
      creditsRemaining: number;
    };
