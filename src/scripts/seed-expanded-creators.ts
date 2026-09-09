/**
 * Expands the creator inventory beyond the initial 10 (src/scripts/seed-initial-creators.ts)
 * with 25 more solo creators, giving every currently-empty metro filter
 * (HOU, ATX, ATL, NYC/NJ, CHI) real data, plus additional DFW/DMV coverage
 * — plus one sample row each for the 4 non-solo-creator entity types
 * (stage_emcee, dance_troupe, local_dj, event_planner) so `/discover`'s
 * entity-type tabs aren't empty during manual QA. Same approach as the
 * original seeder: goes through the real `InstagramIngestWorker` so
 * bio-parsing, brand-disclosure detection, and availability scoring all run
 * for real, not just fixture data with pre-computed fields.
 *
 * Idempotent: ingestCreatorBatch upserts on `handle`, and every handle here
 * is distinct from the original 10, so re-running this only ever updates
 * these same 25 rows — it can never duplicate them or collide with the
 * original batch.
 *
 * Six creators carry a real commercial disclosure post naming a brand in
 * the ingest worker's vertical dictionary (Banking: American Express;
 * Telecom: T-Mobile, Verizon; Beverage: Red Bull, Ketel One), producing
 * genuinely active 60-day blackout windows — not hardcoded conflict rows.
 *
 * Usage: `npx tsx --env-file=.env.local src/scripts/seed-expanded-creators.ts`
 */

import { InstagramIngestWorker, type ScrapedCreatorPayload } from '@/workers/ingest-worker';
import { getServiceRoleClient } from '@/lib/supabase/service';

/** ISO date (YYYY-MM-DD) `n` days before the moment this script runs. */
function daysAgo(n: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - n);
  return date.toISOString().slice(0, 10);
}

const CREATORS: ScrapedCreatorPayload[] = [
  // ---------------------------------------------------------------------
  // Austin, TX — 4
  // ---------------------------------------------------------------------
  {
    handle: 'kiranreddy.atx',
    displayName: 'Kiran Reddy',
    bio: "Austin's premier Telugu cultural events host | Ugadi, Sankranti & community festivals | Bookings: booking@atxculturalcollective.com",
    primaryMetro: 'AUSTIN_TX',
    primaryNiche: 'CULTURAL_EVENTS',
    secondaryLanguages: ['Telugu', 'English'],
    followerCount: 165000,
    engagementRate: 4.2,
    avgReelViews: 68000,
    estMinimumRateUsd: 700,
    estMaximumRateUsd: 2000,
    deliverabilityScoreHint: 96,
    verifiedResponseHoursHint: 10,
    isVerified: true,
    daysSinceLastPost: 4,
    recentSponsorshipCount14d: 1,
    recentPosts: [{ caption: 'Ugadi celebration recap — thank you Austin! 🎉', postDate: daysAgo(4), taggedAccounts: [] }],
  },
  {
    handle: 'zaraahmed.nights',
    displayName: 'Zara Ahmed',
    bio: 'ATX nightlife & Bollywood party host | mgmt@zaraahmedmedia.com for bookings',
    primaryMetro: 'AUSTIN_TX',
    primaryNiche: 'NIGHTLIFE',
    secondaryLanguages: ['Urdu', 'Hindi', 'English'],
    followerCount: 92000,
    engagementRate: 5.1,
    avgReelViews: 38000,
    estMinimumRateUsd: 450,
    estMaximumRateUsd: 1300,
    deliverabilityScoreHint: 92,
    verifiedResponseHoursHint: 16,
    isVerified: true,
    daysSinceLastPost: 6,
    recentSponsorshipCount14d: 0,
    recentPosts: [{ caption: 'Last night’s set was unreal 🔥', postDate: daysAgo(6), taggedAccounts: [] }],
  },
  {
    handle: 'devikanair.dance',
    displayName: 'Devika Nair',
    bio: 'Austin-based choreographer | Sangeet & stage productions | devika.nair.dance@gmail.com',
    primaryMetro: 'AUSTIN_TX',
    primaryNiche: 'CHOREOGRAPHY',
    secondaryLanguages: ['Malayalam', 'English'],
    followerCount: 34000,
    engagementRate: 6.5,
    avgReelViews: 15000,
    estMinimumRateUsd: 280,
    estMaximumRateUsd: 700,
    deliverabilityScoreHint: 90,
    verifiedResponseHoursHint: 20,
    isVerified: true,
    daysSinceLastPost: 3,
    recentSponsorshipCount14d: 0,
    recentPosts: [{ caption: 'New choreography reveal for this year’s sangeet season ✨', postDate: daysAgo(3), taggedAccounts: [] }],
  },
  {
    handle: 'sanjaypatel.eats',
    displayName: 'Sanjay Patel',
    bio: 'Austin food & restaurant content creator | talent@atxfoodtalent.com',
    primaryMetro: 'AUSTIN_TX',
    primaryNiche: 'FOOD_DINING',
    secondaryLanguages: ['Gujarati', 'Hindi', 'English'],
    followerCount: 121000,
    engagementRate: 4.6,
    avgReelViews: 49000,
    estMinimumRateUsd: 600,
    estMaximumRateUsd: 1700,
    deliverabilityScoreHint: 95,
    verifiedResponseHoursHint: 12,
    isVerified: true,
    daysSinceLastPost: 5,
    recentSponsorshipCount14d: 0,
    recentPosts: [{ caption: 'Best chaat in South Austin, hands down 🌶️', postDate: daysAgo(5), taggedAccounts: [] }],
  },

  // ---------------------------------------------------------------------
  // Houston, TX — 4
  // ---------------------------------------------------------------------
  {
    handle: 'meherkhan.bridal',
    displayName: 'Meherunnisa Khan',
    bio: 'Houston luxury bridal creator | South Asian wedding styling | booking@houstonbridalagency.com',
    primaryMetro: 'HOUSTON_TX',
    primaryNiche: 'LUXURY_BRIDAL',
    secondaryLanguages: ['Urdu', 'English'],
    followerCount: 198000,
    engagementRate: 3.6,
    avgReelViews: 79000,
    estMinimumRateUsd: 850,
    estMaximumRateUsd: 2600,
    deliverabilityScoreHint: 98,
    verifiedResponseHoursHint: 6,
    isVerified: true,
    daysSinceLastPost: 2,
    recentSponsorshipCount14d: 2,
    recentPosts: [{ caption: 'Bridal look of the week 💍', postDate: daysAgo(2), taggedAccounts: [] }],
  },
  {
    handle: 'ravichandran.mc',
    displayName: 'Ravi Chandran',
    bio: 'Bilingual stage emcee, Houston | Weddings & corporate galas | mgmt@ravichandranmc.com',
    primaryMetro: 'HOUSTON_TX',
    primaryNiche: 'STAGE_EMCEE',
    secondaryLanguages: ['Tamil', 'English'],
    followerCount: 71000,
    engagementRate: 5.4,
    avgReelViews: 30000,
    estMinimumRateUsd: 380,
    estMaximumRateUsd: 1000,
    deliverabilityScoreHint: 93,
    verifiedResponseHoursHint: 14,
    isVerified: true,
    daysSinceLastPost: 7,
    recentSponsorshipCount14d: 0,
    recentPosts: [{ caption: 'Emceed the most fun corporate gala last night 🎤', postDate: daysAgo(7), taggedAccounts: [] }],
  },
  {
    handle: 'anjalibhatt.moves',
    displayName: 'Anjali Bhatt',
    bio: 'Houston choreographer & dance instructor | anjali.bhatt.moves@gmail.com',
    primaryMetro: 'HOUSTON_TX',
    primaryNiche: 'CHOREOGRAPHY',
    secondaryLanguages: ['Gujarati', 'Hindi', 'English'],
    followerCount: 45000,
    engagementRate: 6.1,
    avgReelViews: 19000,
    estMinimumRateUsd: 300,
    estMaximumRateUsd: 800,
    deliverabilityScoreHint: 89,
    verifiedResponseHoursHint: 22,
    isVerified: true,
    daysSinceLastPost: 8,
    recentSponsorshipCount14d: 0,
    recentPosts: [{ caption: 'Sunday class recap — so proud of this group 💃', postDate: daysAgo(8), taggedAccounts: [] }],
  },
  {
    handle: 'farhansiddiqui.hou',
    displayName: 'Farhan Siddiqui',
    bio: 'Bayou City cultural events host | Eid, Diwali & community programming | Bookings: booking@bayoucityculturalagency.com',
    primaryMetro: 'HOUSTON_TX',
    primaryNiche: 'CULTURAL_EVENTS',
    secondaryLanguages: ['Urdu', 'Hindi', 'English'],
    followerCount: 88000,
    engagementRate: 4.9,
    avgReelViews: 36000,
    estMinimumRateUsd: 420,
    estMaximumRateUsd: 1200,
    deliverabilityScoreHint: 94,
    verifiedResponseHoursHint: 12,
    isVerified: true,
    daysSinceLastPost: 6,
    recentSponsorshipCount14d: 1,
    recentPosts: [
      {
        caption: 'Thrilled to partner with @americanexpress for their small business spotlight series! #ad',
        postDate: daysAgo(7),
        taggedAccounts: ['americanexpress'],
      },
    ],
  },

  // ---------------------------------------------------------------------
  // Atlanta, GA — 4
  // ---------------------------------------------------------------------
  {
    handle: 'priyankac.nights',
    displayName: 'Priyanka Chowdhury',
    bio: "Atlanta's go-to Bollywood nightlife host | talent@atlnightlifetalent.com",
    primaryMetro: 'ATLANTA_GA',
    primaryNiche: 'NIGHTLIFE',
    secondaryLanguages: ['Hindi', 'English'],
    followerCount: 156000,
    engagementRate: 4.0,
    avgReelViews: 63000,
    estMinimumRateUsd: 650,
    estMaximumRateUsd: 1900,
    deliverabilityScoreHint: 97,
    verifiedResponseHoursHint: 8,
    isVerified: true,
    daysSinceLastPost: 4,
    recentSponsorshipCount14d: 1,
    recentPosts: [
      { caption: 'Fueled by @redbull for tonight’s set! #ad', postDate: daysAgo(8), taggedAccounts: ['redbull'] },
    ],
  },
  {
    handle: 'vishalkumar.eats',
    displayName: 'Vishal Kumar',
    bio: 'ATL food creator & restaurant reviews | mgmt@vishalkumarmedia.com',
    primaryMetro: 'ATLANTA_GA',
    primaryNiche: 'FOOD_DINING',
    secondaryLanguages: ['Punjabi', 'Hindi', 'English'],
    followerCount: 58000,
    engagementRate: 5.8,
    avgReelViews: 24000,
    estMinimumRateUsd: 330,
    estMaximumRateUsd: 900,
    deliverabilityScoreHint: 91,
    verifiedResponseHoursHint: 18,
    isVerified: true,
    daysSinceLastPost: 9,
    recentSponsorshipCount14d: 0,
    recentPosts: [{ caption: 'This new Buford Highway spot is a must-try 🍜', postDate: daysAgo(9), taggedAccounts: [] }],
  },
  {
    handle: 'ishitashah.bridal',
    displayName: 'Ishita Shah',
    bio: 'Luxury bridal content creator, Atlanta | ishita.shah.bridal@gmail.com',
    primaryMetro: 'ATLANTA_GA',
    primaryNiche: 'LUXURY_BRIDAL',
    secondaryLanguages: ['Gujarati', 'English'],
    followerCount: 233000,
    engagementRate: 3.1,
    avgReelViews: 93000,
    estMinimumRateUsd: 950,
    estMaximumRateUsd: 3200,
    deliverabilityScoreHint: 99,
    verifiedResponseHoursHint: 5,
    isVerified: true,
    daysSinceLastPost: 1,
    recentSponsorshipCount14d: 1,
    recentPosts: [
      {
        caption: 'So honored to be featured in this @americanexpress cardmember campaign #sponsored',
        postDate: daysAgo(10),
        taggedAccounts: ['americanexpress'],
      },
    ],
  },
  {
    handle: 'aamirhussain.mc',
    displayName: 'Aamir Hussain',
    bio: 'Peach State stage emcee & MC | talent@peachstatetalent.com',
    primaryMetro: 'ATLANTA_GA',
    primaryNiche: 'STAGE_EMCEE',
    secondaryLanguages: ['Urdu', 'English'],
    followerCount: 79000,
    engagementRate: 5.2,
    avgReelViews: 33000,
    estMinimumRateUsd: 400,
    estMaximumRateUsd: 1100,
    deliverabilityScoreHint: 92,
    verifiedResponseHoursHint: 15,
    isVerified: true,
    daysSinceLastPost: 5,
    recentSponsorshipCount14d: 0,
    recentPosts: [{ caption: 'What a weekend hosting the ATL gala circuit 🎙️', postDate: daysAgo(5), taggedAccounts: [] }],
  },

  // ---------------------------------------------------------------------
  // Tri-State NY/NJ — 4
  // ---------------------------------------------------------------------
  {
    handle: 'nandinirao.nyc',
    displayName: 'Nandini Rao',
    bio: 'NYC/NJ Telugu cultural events host | Bookings: booking@empirestateculturalagency.com',
    primaryMetro: 'TRI_STATE_NY_NJ',
    primaryNiche: 'CULTURAL_EVENTS',
    secondaryLanguages: ['Telugu', 'English'],
    followerCount: 142000,
    engagementRate: 4.3,
    avgReelViews: 58000,
    estMinimumRateUsd: 700,
    estMaximumRateUsd: 2000,
    deliverabilityScoreHint: 96,
    verifiedResponseHoursHint: 9,
    isVerified: true,
    daysSinceLastPost: 3,
    recentSponsorshipCount14d: 1,
    recentPosts: [
      {
        caption: 'Powering our cultural festival livestream — collab with @tmobile 5G',
        postDate: daysAgo(6),
        taggedAccounts: ['tmobile'],
      },
    ],
  },
  {
    handle: 'karthiks.dance',
    displayName: 'Karthik Subramaniam',
    bio: 'Tri-State choreographer, sangeet specialist | mgmt@karthiksmedia.com',
    primaryMetro: 'TRI_STATE_NY_NJ',
    primaryNiche: 'CHOREOGRAPHY',
    secondaryLanguages: ['Tamil', 'English'],
    followerCount: 61000,
    engagementRate: 5.6,
    avgReelViews: 26000,
    estMinimumRateUsd: 350,
    estMaximumRateUsd: 950,
    deliverabilityScoreHint: 90,
    verifiedResponseHoursHint: 19,
    isVerified: true,
    daysSinceLastPost: 6,
    recentSponsorshipCount14d: 0,
    recentPosts: [{ caption: 'Rehearsal footage from this weekend’s sangeet 💫', postDate: daysAgo(6), taggedAccounts: [] }],
  },
  {
    handle: 'simranbhalla.nyc',
    displayName: 'Simran Bhalla',
    bio: 'NYC Bollywood nightlife & club host | simran.bhalla.nyc@gmail.com',
    primaryMetro: 'TRI_STATE_NY_NJ',
    primaryNiche: 'NIGHTLIFE',
    secondaryLanguages: ['Punjabi', 'Hindi', 'English'],
    followerCount: 27000,
    engagementRate: 6.9,
    avgReelViews: 12000,
    estMinimumRateUsd: 260,
    estMaximumRateUsd: 650,
    deliverabilityScoreHint: 88,
    verifiedResponseHoursHint: 24,
    isVerified: true,
    daysSinceLastPost: 4,
    recentSponsorshipCount14d: 0,
    recentPosts: [{ caption: 'Manhattan rooftop set last night 🌃', postDate: daysAgo(4), taggedAccounts: [] }],
  },
  {
    handle: 'rehanmalik.bridal',
    displayName: 'Rehan Malik',
    bio: 'NJ luxury bridal creator | talent@njbridaltalent.com',
    primaryMetro: 'TRI_STATE_NY_NJ',
    primaryNiche: 'LUXURY_BRIDAL',
    secondaryLanguages: ['Urdu', 'English'],
    followerCount: 176000,
    engagementRate: 3.8,
    avgReelViews: 71000,
    estMinimumRateUsd: 780,
    estMaximumRateUsd: 2300,
    deliverabilityScoreHint: 97,
    verifiedResponseHoursHint: 7,
    isVerified: true,
    daysSinceLastPost: 2,
    recentSponsorshipCount14d: 0,
    recentPosts: [{ caption: 'Behind the scenes of today’s reception shoot 📸', postDate: daysAgo(2), taggedAccounts: [] }],
  },

  // ---------------------------------------------------------------------
  // Chicago, IL — 3
  // ---------------------------------------------------------------------
  {
    handle: 'deepikajoshi.mc',
    displayName: 'Deepika Joshi',
    bio: 'Chicago bilingual stage emcee | Bookings: booking@windycitytalent.com',
    primaryMetro: 'CHICAGO_IL',
    primaryNiche: 'STAGE_EMCEE',
    secondaryLanguages: ['Hindi', 'English'],
    followerCount: 99000,
    engagementRate: 4.7,
    avgReelViews: 41000,
    estMinimumRateUsd: 500,
    estMaximumRateUsd: 1400,
    deliverabilityScoreHint: 94,
    verifiedResponseHoursHint: 11,
    isVerified: true,
    daysSinceLastPost: 5,
    recentSponsorshipCount14d: 0,
    recentPosts: [{ caption: 'Hosting duties complete for this year’s Diwali gala ✨', postDate: daysAgo(5), taggedAccounts: [] }],
  },
  {
    handle: 'omtrivedi.eats',
    displayName: 'Om Trivedi',
    bio: 'Windy City food & dining creator | om.trivedi.eats@gmail.com',
    primaryMetro: 'CHICAGO_IL',
    primaryNiche: 'FOOD_DINING',
    secondaryLanguages: ['Gujarati', 'Hindi', 'English'],
    followerCount: 41000,
    engagementRate: 6.3,
    avgReelViews: 17000,
    estMinimumRateUsd: 290,
    estMaximumRateUsd: 750,
    deliverabilityScoreHint: 89,
    verifiedResponseHoursHint: 21,
    isVerified: true,
    daysSinceLastPost: 7,
    recentSponsorshipCount14d: 1,
    recentPosts: [
      {
        caption: 'Crafting the perfect evening — paid partnership with @ketelone',
        postDate: daysAgo(12),
        taggedAccounts: ['ketelone'],
      },
    ],
  },
  {
    handle: 'lavanyapillai.dance',
    displayName: 'Lavanya Pillai',
    bio: 'Chicago choreographer, stage productions | mgmt@lavanyapillaimedia.com',
    primaryMetro: 'CHICAGO_IL',
    primaryNiche: 'CHOREOGRAPHY',
    secondaryLanguages: ['Tamil', 'Malayalam', 'English'],
    followerCount: 118000,
    engagementRate: 4.4,
    avgReelViews: 48000,
    estMinimumRateUsd: 600,
    estMaximumRateUsd: 1700,
    deliverabilityScoreHint: 95,
    verifiedResponseHoursHint: 10,
    isVerified: true,
    daysSinceLastPost: 4,
    recentSponsorshipCount14d: 0,
    recentPosts: [{ caption: 'New production teaser dropping this week 🎬', postDate: daysAgo(4), taggedAccounts: [] }],
  },

  // ---------------------------------------------------------------------
  // DFW_TEXAS — 3 more
  // ---------------------------------------------------------------------
  {
    handle: 'zoyaahmed.bridal',
    displayName: 'Zoya Ahmed',
    bio: 'DFW luxury bridal & reception stylist | talent@dfwbridaltalent.com',
    primaryMetro: 'DFW_TEXAS',
    primaryNiche: 'LUXURY_BRIDAL',
    secondaryLanguages: ['Urdu', 'English'],
    followerCount: 205000,
    engagementRate: 3.4,
    avgReelViews: 82000,
    estMinimumRateUsd: 900,
    estMaximumRateUsd: 2800,
    deliverabilityScoreHint: 98,
    verifiedResponseHoursHint: 6,
    isVerified: true,
    daysSinceLastPost: 2,
    // Deliberately >= 3 with no dictionary-recognized brand in recentPosts —
    // a clean "High Demand" example with no active blackout muddying the chip.
    recentSponsorshipCount14d: 3,
    recentPosts: [{ caption: 'Three bridal shoots this week and counting 💍', postDate: daysAgo(2), taggedAccounts: [] }],
  },
  {
    handle: 'harpreetsingh.dfw',
    displayName: 'Harpreet Singh',
    bio: 'Lone Star nightlife promoter & host | Bookings: booking@lonestarnightlifeagency.com',
    primaryMetro: 'DFW_TEXAS',
    primaryNiche: 'NIGHTLIFE',
    secondaryLanguages: ['Punjabi', 'English'],
    followerCount: 67000,
    engagementRate: 5.5,
    avgReelViews: 28000,
    estMinimumRateUsd: 370,
    estMaximumRateUsd: 1000,
    deliverabilityScoreHint: 91,
    verifiedResponseHoursHint: 17,
    isVerified: true,
    daysSinceLastPost: 6,
    recentSponsorshipCount14d: 1,
    recentPosts: [
      {
        caption: 'Paid partnership with @verizon bringing next-gen connectivity to our club nights',
        postDate: daysAgo(9),
        taggedAccounts: ['verizon'],
      },
    ],
  },
  {
    handle: 'meenaiyer.eats',
    displayName: 'Meena Iyer',
    bio: 'DFW food content creator | meena.iyer.eats@gmail.com',
    primaryMetro: 'DFW_TEXAS',
    primaryNiche: 'FOOD_DINING',
    secondaryLanguages: ['Tamil', 'English'],
    followerCount: 19000,
    engagementRate: 7.2,
    avgReelViews: 8500,
    estMinimumRateUsd: 250,
    estMaximumRateUsd: 550,
    deliverabilityScoreHint: 88,
    verifiedResponseHoursHint: 30,
    isVerified: true,
    // > 45 -> a clean "Roster Closed" example among the new batch.
    daysSinceLastPost: 48,
    recentSponsorshipCount14d: 0,
    recentPosts: [],
  },

  // ---------------------------------------------------------------------
  // DMV_NOVA — 3 more
  // ---------------------------------------------------------------------
  {
    handle: 'ashwinnambiar.dance',
    displayName: 'Ashwin Nambiar',
    bio: 'DMV choreographer & dance troupe lead | mgmt@ashwinnambiarmedia.com',
    primaryMetro: 'DMV_NOVA',
    primaryNiche: 'CHOREOGRAPHY',
    secondaryLanguages: ['Malayalam', 'Kannada', 'English'],
    followerCount: 84000,
    engagementRate: 5.0,
    avgReelViews: 35000,
    estMinimumRateUsd: 430,
    estMaximumRateUsd: 1200,
    deliverabilityScoreHint: 93,
    verifiedResponseHoursHint: 13,
    isVerified: true,
    daysSinceLastPost: 5,
    recentSponsorshipCount14d: 0,
    recentPosts: [{ caption: 'Troupe rehearsal ahead of this weekend’s showcase 🕺', postDate: daysAgo(5), taggedAccounts: [] }],
  },
  {
    handle: 'fatimarizvi.mc',
    displayName: 'Fatima Rizvi',
    bio: 'Capital region stage emcee | talent@capitalregiontalent.com',
    primaryMetro: 'DMV_NOVA',
    primaryNiche: 'STAGE_EMCEE',
    secondaryLanguages: ['Urdu', 'Hindi', 'English'],
    followerCount: 132000,
    engagementRate: 4.5,
    avgReelViews: 54000,
    estMinimumRateUsd: 650,
    estMaximumRateUsd: 1850,
    deliverabilityScoreHint: 96,
    verifiedResponseHoursHint: 9,
    isVerified: true,
    daysSinceLastPost: 3,
    recentSponsorshipCount14d: 0,
    recentPosts: [{ caption: 'Another wonderful gala hosted this weekend 🎤', postDate: daysAgo(3), taggedAccounts: [] }],
  },
  {
    handle: 'gopalkrishnan.dmv',
    displayName: 'Gopal Krishnan',
    bio: 'DMV South Indian cultural events host | gopal.krishnan.dmv@gmail.com',
    primaryMetro: 'DMV_NOVA',
    primaryNiche: 'CULTURAL_EVENTS',
    secondaryLanguages: ['Tamil', 'Telugu', 'English'],
    followerCount: 47000,
    engagementRate: 6.0,
    avgReelViews: 20000,
    estMinimumRateUsd: 310,
    estMaximumRateUsd: 800,
    deliverabilityScoreHint: 90,
    verifiedResponseHoursHint: 18,
    isVerified: true,
    daysSinceLastPost: 8,
    recentSponsorshipCount14d: 0,
    recentPosts: [{ caption: 'Pongal celebration recap — what a turnout! 🌾', postDate: daysAgo(8), taggedAccounts: [] }],
  },

  // ---------------------------------------------------------------------
  // Non-solo-creator entity types — a small sample of each new
  // EntityType so /discover's new tabs (stage_emcee, dance_troupe,
  // local_dj, event_planner) aren't empty during manual QA. solo_creator
  // is the default for every row above (no entityType set).
  // ---------------------------------------------------------------------
  {
    handle: 'mc.rohan.dfw',
    displayName: 'Rohan Mehta',
    bio: 'DFW stage emcee & panel moderator | Weddings, galas, corporate | booking@rohanmehtaevents.com',
    entityType: 'stage_emcee',
    primaryMetro: 'DFW_TEXAS',
    primaryNiche: 'STAGE_EMCEE',
    secondaryLanguages: ['Hindi', 'English'],
    followerCount: 58000,
    engagementRate: 4.8,
    avgReelViews: 21000,
    estMinimumRateUsd: 900,
    estMaximumRateUsd: 2500,
    deliverabilityScoreHint: 94,
    verifiedResponseHoursHint: 12,
    isVerified: true,
    daysSinceLastPost: 5,
    recentSponsorshipCount14d: 0,
    recentPosts: [{ caption: 'Hosted an incredible 400-guest gala last night 🎤', postDate: daysAgo(5), taggedAccounts: [] }],
  },
  {
    handle: 'nrityasangam.dfw',
    displayName: 'Nritya Sangam Dance Academy',
    bio: 'DFW Bollywood Fusion & Bharatanatyam troupe | 18 dancers | Sangeet, festivals, stage shows | mgmt@nrityasangam.com',
    entityType: 'dance_troupe',
    entityDetails: {
      kind: 'dance_troupe',
      troupeSize: 18,
      style: 'Bollywood Fusion',
      stageRiderNotes: '20x20 min stage clearance, wireless mic for lead, wired monitor for sound cue.',
      honorariumNote: 'Group rate — travel outside DFW metro billed separately.',
    },
    primaryMetro: 'DFW_TEXAS',
    primaryNiche: 'CULTURAL_EVENTS',
    secondaryLanguages: ['Hindi', 'English'],
    followerCount: 41000,
    engagementRate: 5.9,
    avgReelViews: 26000,
    estMinimumRateUsd: 1500,
    estMaximumRateUsd: 4000,
    deliverabilityScoreHint: 91,
    verifiedResponseHoursHint: 24,
    isVerified: true,
    daysSinceLastPost: 7,
    recentSponsorshipCount14d: 0,
    recentPosts: [{ caption: 'Sangeet season is here — booking now for fall 💃', postDate: daysAgo(7), taggedAccounts: [] }],
  },
  {
    handle: 'djarjun.dmv',
    displayName: 'DJ Arjun',
    bio: 'DMV club & wedding DJ | Full sound + lighting rig | Bollywood, Bhangra, EDM sets | djarjun.bookings@gmail.com',
    entityType: 'local_dj',
    entityDetails: {
      kind: 'local_dj',
      avSpecNotes: 'Full sound + stage lighting included — dual QSC K12.2 tops, sub, LED par cans.',
      maxCapacity: 800,
      setLengthMinutes: 240,
      rigSpecNotes: 'Pioneer CDJ-3000 x2 + DJM-900NXS2, backup laptop rig.',
      genreTags: ['Bollywood', 'Bhangra / Punjabi', 'EDM'],
    },
    primaryMetro: 'DMV_NOVA',
    primaryNiche: 'NIGHTLIFE',
    secondaryLanguages: ['Punjabi', 'Hindi', 'English'],
    followerCount: 76000,
    engagementRate: 5.3,
    avgReelViews: 33000,
    estMinimumRateUsd: 1200,
    estMaximumRateUsd: 2800,
    deliverabilityScoreHint: 93,
    verifiedResponseHoursHint: 14,
    isVerified: true,
    daysSinceLastPost: 3,
    recentSponsorshipCount14d: 0,
    recentPosts: [{ caption: 'Full rig set up for last night’s reception 🎧', postDate: daysAgo(3), taggedAccounts: [] }],
  },
  {
    handle: 'grandeur.events.hou',
    displayName: 'Grandeur Events & Decor',
    bio: 'Houston mandap design, stage truss, and full event production | Boutique to festival scale | info@grandeurevents.co',
    entityType: 'event_planner',
    entityDetails: {
      kind: 'event_planner',
      venueScaleBracket: 'mid_scale',
      permitRating: 88,
      portfolioUrl: 'https://grandeurevents.co/portfolio',
    },
    primaryMetro: 'HOUSTON_TX',
    primaryNiche: 'LUXURY_BRIDAL',
    secondaryLanguages: ['Gujarati', 'Hindi', 'English'],
    followerCount: 29000,
    engagementRate: 4.4,
    avgReelViews: 12000,
    estMinimumRateUsd: 3000,
    estMaximumRateUsd: 15000,
    deliverabilityScoreHint: 89,
    verifiedResponseHoursHint: 30,
    isVerified: true,
    daysSinceLastPost: 9,
    recentSponsorshipCount14d: 0,
    recentPosts: [{ caption: 'This mandap took 14 hours to build — worth every minute ✨', postDate: daysAgo(9), taggedAccounts: [] }],
  },
];

// =====================================================================================
// Run
// =====================================================================================

async function main(): Promise<void> {
  const supabase = getServiceRoleClient();
  const worker = new InstagramIngestWorker();

  console.log(`Seeding ${CREATORS.length} expanded creators...`);
  const result = await worker.ingestCreatorBatch(supabase, CREATORS);
  console.log(`  succeeded: ${result.succeeded}/${result.totalProcessed}`);
  for (const err of result.errors) {
    console.log(`  [${err.stage}] ${err.identifier}: ${err.message}`);
  }

  if (result.failed > 0) {
    console.error(`\n${result.failed} record(s) failed to seed — see errors above.`);
    process.exitCode = 1;
    return;
  }

  console.log('\nExpanded seed complete.');
}

main().catch((err) => {
  console.error('Expanded seed script crashed:', err);
  process.exitCode = 1;
});
