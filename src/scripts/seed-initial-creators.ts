/**
 * Seeds Supabase with a small, realistic demo dataset: 10 verified creators
 * across the DFW and DMV hubs (Cultural Events, Stage Emcees, Luxury
 * Bridal) and 4 event promoters — enough to exercise every surface built
 * in Steps 1-6 (directories, /discover filters, the detail drawer, PDF
 * export, the committee board, the DaaS API) without needing a real
 * scrape.
 *
 * Goes through the actual `InstagramIngestWorker` (src/workers/ingest-worker.ts)
 * rather than inserting rows directly, so the same bio-parsing, brand-
 * disclosure detection, and availability-scoring logic that will run
 * against real scraped data runs here too. Four of the ten creators carry
 * a commercial post referencing a brand in the worker's built-in vertical
 * dictionary, which the worker turns into a real, currently-active
 * creator_category_blackouts row (post date + 60 days) — not a fabricated
 * one, computed the same way a live ingestion run would.
 *
 * Usage: `npm run seed` (requires NEXT_PUBLIC_SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY — see .env.example).
 */

import { InstagramIngestWorker, type ScrapedCreatorPayload, type ScrapedEnterprisePayload } from '@/workers/ingest-worker';
import { getServiceRoleClient } from '@/lib/supabase/service';

/** ISO date (YYYY-MM-DD) `n` days before the moment this script runs — keeps the four commercial posts, and the blackout windows they generate, always recent/active regardless of when this is run. */
function daysAgo(n: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - n);
  return date.toISOString().slice(0, 10);
}

// =====================================================================================
// Creators — 5 DFW_TEXAS / 5 DMV_NOVA, spanning CULTURAL_EVENTS, STAGE_EMCEE,
// and LUXURY_BRIDAL, and all four RepType classification outcomes (agency,
// direct manager, self-represented, unverified) so the ingest worker's own
// bio-parsing logic is genuinely exercised, not just fed pre-labeled data.
// =====================================================================================

const CREATORS: ScrapedCreatorPayload[] = [
  {
    handle: 'priya.desai.events',
    displayName: 'Priya Desai',
    bio: 'Dallas–Fort Worth cultural events host | Diwali, Holi & community celebrations | Bookings: booking@starlighttalentagency.com',
    primaryMetro: 'DFW_TEXAS',
    primaryNiche: 'CULTURAL_EVENTS',
    secondaryLanguages: ['Hindi', 'Gujarati', 'English'],
    followerCount: 145000,
    engagementRate: 4.8,
    avgReelViews: 62000,
    estMinimumRateUsd: 600,
    estMaximumRateUsd: 1800,
    deliverabilityScoreHint: 97,
    verifiedResponseHoursHint: 12,
    isVerified: true,
    daysSinceLastPost: 3,
    recentSponsorshipCount14d: 1,
    recentPosts: [
      {
        caption: 'So grateful for this collab with @tmobile bringing 5G to our Diwali mela this year! #ad',
        postDate: daysAgo(8),
        taggedAccounts: ['tmobile', 'dfwdiwalimela'],
      },
      {
        caption: 'Sunday morning garba practice with the crew 💃',
        postDate: daysAgo(2),
        taggedAccounts: ['dfwgarbagroup'],
      },
    ],
  },
  {
    handle: 'arjunmehta.dfw',
    displayName: 'Arjun Mehta',
    bio: 'DFW cultural programming & festival emcee | mgmt@arjunmehtaevents.com for bookings',
    primaryMetro: 'DFW_TEXAS',
    primaryNiche: 'CULTURAL_EVENTS',
    secondaryLanguages: ['Hindi', 'English'],
    followerCount: 38000,
    engagementRate: 5.9,
    avgReelViews: 21000,
    estMinimumRateUsd: 250,
    estMaximumRateUsd: 700,
    deliverabilityScoreHint: 93,
    verifiedResponseHoursHint: 18,
    isVerified: true,
    daysSinceLastPost: 5,
    recentSponsorshipCount14d: 0,
    recentPosts: [
      {
        caption: 'Backstage before hosting the Frisco cultural showcase — such an honor 🎤',
        postDate: daysAgo(6),
        taggedAccounts: ['friscoculturalcouncil'],
      },
    ],
  },
  {
    handle: 'nehakapoor.mc',
    displayName: 'Neha Kapoor',
    bio: 'Bilingual stage emcee, Dallas–Fort Worth | Weddings, galas, corporate | talent@dfwstartalent.com',
    primaryMetro: 'DFW_TEXAS',
    primaryNiche: 'STAGE_EMCEE',
    secondaryLanguages: ['Hindi', 'Punjabi', 'English'],
    followerCount: 92000,
    engagementRate: 3.6,
    avgReelViews: 34000,
    estMinimumRateUsd: 450,
    estMaximumRateUsd: 1200,
    deliverabilityScoreHint: 95,
    verifiedResponseHoursHint: 10,
    isVerified: true,
    daysSinceLastPost: 4,
    recentSponsorshipCount14d: 1,
    recentPosts: [
      {
        caption: 'Emceed the most beautiful sangeet this weekend — thank you for having me!',
        postDate: daysAgo(4),
        taggedAccounts: ['theamitandriyaWedding'],
      },
    ],
  },
  {
    handle: 'rohaniyer.voice',
    displayName: 'Rohan Iyer',
    bio: "DFW's go-to bilingual host for South Asian weddings & sangeets | rohaniyer.voice@gmail.com",
    primaryMetro: 'DFW_TEXAS',
    primaryNiche: 'STAGE_EMCEE',
    secondaryLanguages: ['Tamil', 'Hindi', 'English'],
    followerCount: 21000,
    engagementRate: 6.4,
    avgReelViews: 14000,
    estMinimumRateUsd: 200,
    estMaximumRateUsd: 500,
    deliverabilityScoreHint: 88,
    verifiedResponseHoursHint: 24,
    isVerified: true,
    daysSinceLastPost: 7,
    recentSponsorshipCount14d: 0,
    recentPosts: [
      {
        caption: 'Mic check for tonight’s reception 🎙️',
        postDate: daysAgo(7),
        taggedAccounts: [],
      },
    ],
  },
  {
    handle: 'ananyarao.bridal',
    displayName: 'Ananya Rao',
    bio: 'Luxury bridal content creator, DFW | Sangeet & reception styling | booking@luxebridalagency.com',
    primaryMetro: 'DFW_TEXAS',
    primaryNiche: 'LUXURY_BRIDAL',
    secondaryLanguages: ['Telugu', 'Hindi', 'English'],
    followerCount: 210000,
    engagementRate: 4.1,
    avgReelViews: 88000,
    estMinimumRateUsd: 900,
    estMaximumRateUsd: 2800,
    deliverabilityScoreHint: 99,
    verifiedResponseHoursHint: 6,
    isVerified: true,
    daysSinceLastPost: 1,
    recentSponsorshipCount14d: 3,
    recentPosts: [
      {
        caption: 'Obsessed with this look — paid partnership with @davidsbridal for the fall collection launch ✨',
        postDate: daysAgo(5),
        taggedAccounts: ['davidsbridal'],
      },
      {
        caption: 'Behind the scenes of today’s reception styling shoot',
        postDate: daysAgo(1),
        taggedAccounts: [],
      },
    ],
  },
  {
    handle: 'simran.kaur.dmv',
    displayName: 'Simran Kaur',
    bio: 'DMV Punjabi & Hindi cultural events host | mgmt@simrankaurmedia.com',
    primaryMetro: 'DMV_NOVA',
    primaryNiche: 'CULTURAL_EVENTS',
    secondaryLanguages: ['Punjabi', 'Hindi', 'English'],
    followerCount: 67000,
    engagementRate: 5.2,
    avgReelViews: 29000,
    estMinimumRateUsd: 350,
    estMaximumRateUsd: 950,
    deliverabilityScoreHint: 94,
    verifiedResponseHoursHint: 14,
    isVerified: true,
    daysSinceLastPost: 6,
    recentSponsorshipCount14d: 0,
    recentPosts: [
      {
        caption: 'Vaisakhi mela recap — what a crowd!',
        postDate: daysAgo(6),
        taggedAccounts: ['dmvvaisakhi'],
      },
    ],
  },
  {
    handle: 'vikramnair.mc',
    displayName: 'Vikram Nair',
    bio: 'DMV stage emcee & MC | Corporate, cultural, and nightlife events | talent@capitalstageagency.com',
    primaryMetro: 'DMV_NOVA',
    primaryNiche: 'STAGE_EMCEE',
    secondaryLanguages: ['Malayalam', 'Hindi', 'English'],
    followerCount: 54000,
    engagementRate: 3.9,
    avgReelViews: 19000,
    estMinimumRateUsd: 300,
    estMaximumRateUsd: 800,
    deliverabilityScoreHint: 91,
    verifiedResponseHoursHint: 20,
    isVerified: true,
    daysSinceLastPost: 9,
    recentSponsorshipCount14d: 1,
    recentPosts: [
      {
        caption: 'High energy set at the rooftop launch party last night #sponsored',
        postDate: daysAgo(11),
        taggedAccounts: ['redbull'],
      },
    ],
  },
  {
    handle: 'divyamenon.weddings',
    displayName: 'Divya Menon',
    bio: 'South Asian bridal creator based in DMV | divya.menon.weddings@gmail.com',
    primaryMetro: 'DMV_NOVA',
    primaryNiche: 'LUXURY_BRIDAL',
    secondaryLanguages: ['English'],
    followerCount: 128000,
    engagementRate: 4.4,
    avgReelViews: 51000,
    estMinimumRateUsd: 550,
    estMaximumRateUsd: 1600,
    deliverabilityScoreHint: 96,
    verifiedResponseHoursHint: 9,
    isVerified: true,
    daysSinceLastPost: 2,
    recentSponsorshipCount14d: 1,
    recentPosts: [
      {
        caption: 'These bridal sets have me speechless every time #ad',
        postDate: daysAgo(9),
        taggedAccounts: ['kayjewelers'],
      },
    ],
  },
  {
    handle: 'karanchopra.events',
    displayName: 'Karan Chopra',
    bio: 'Wedding & reception coverage across the DMV | DM for collabs \u{1F4E9}',
    primaryMetro: 'DMV_NOVA',
    primaryNiche: 'LUXURY_BRIDAL',
    secondaryLanguages: ['English'],
    followerCount: 15000,
    engagementRate: 2.8,
    avgReelViews: 6000,
    estMinimumRateUsd: 150,
    estMaximumRateUsd: 400,
    deliverabilityScoreHint: 75,
    verifiedResponseHoursHint: 48,
    isVerified: true,
    daysSinceLastPost: 52,
    recentSponsorshipCount14d: 0,
    recentPosts: [],
  },
  {
    handle: 'meera.iyengar',
    displayName: 'Meera Iyengar',
    bio: 'Telugu & Tamil cultural events host, Washington DC metro | management@meeraiyengarmedia.com',
    primaryMetro: 'DMV_NOVA',
    primaryNiche: 'CULTURAL_EVENTS',
    secondaryLanguages: ['Telugu', 'Tamil', 'English'],
    followerCount: 83000,
    engagementRate: 5.6,
    avgReelViews: 37000,
    estMinimumRateUsd: 400,
    estMaximumRateUsd: 1100,
    deliverabilityScoreHint: 98,
    verifiedResponseHoursHint: 8,
    isVerified: true,
    daysSinceLastPost: 4,
    recentSponsorshipCount14d: 0,
    recentPosts: [
      {
        caption: 'Onam celebration hosting duties complete — until next year! 🌼',
        postDate: daysAgo(4),
        taggedAccounts: ['dmvonam'],
      },
    ],
  },
];

// =====================================================================================
// Event promoters — 2 DFW_TEXAS / 2 DMV_NOVA, covering all four enterprise types.
// =====================================================================================

const ENTERPRISES: ScrapedEnterprisePayload[] = [
  {
    businessName: 'Dallas Bollywood Nights',
    instagramHandle: 'dallasbollywoodnights',
    metroHub: 'DFW_TEXAS',
    enterpriseType: 'NIGHTLIFE_PROMOTER',
    bio: 'DFW’s biggest Bollywood party series | Bookings: booking@dallasbollywoodnights.com',
    frequentVenues: ['Sound Table Dallas', 'Concrete Cowboy'],
  },
  {
    businessName: 'Lone Star Sangeet Co.',
    instagramHandle: 'lonestarsangeetco',
    metroHub: 'DFW_TEXAS',
    enterpriseType: 'WEDDING_PRODUCER',
    publicEmail: 'hello@lonestarsangeetco.com',
    frequentVenues: ['The Room on Main', 'Hickory Street Annex'],
  },
  {
    businessName: 'Capital Desi Convention Board',
    instagramHandle: 'capitaldesiconvention',
    metroHub: 'DMV_NOVA',
    enterpriseType: 'CONVENTION_BOARD',
    publicEmail: 'info@capitaldesiconvention.org',
    frequentVenues: ['Walter E. Washington Convention Center'],
  },
  {
    businessName: 'NoVA Live Concerts',
    instagramHandle: 'novaliveconcerts',
    metroHub: 'DMV_NOVA',
    enterpriseType: 'CONCERT_ORGANIZER',
    bio: 'Live South Asian concert promoter, Northern Virginia | talent@novaliveconcerts.com',
    ticketingUrl: 'https://novaliveconcerts.com/tickets',
    frequentVenues: ['Wolf Trap', 'The Fillmore Silver Spring'],
  },
];

// =====================================================================================
// Run
// =====================================================================================

async function main(): Promise<void> {
  const supabase = getServiceRoleClient();
  const worker = new InstagramIngestWorker();

  console.log(`Seeding ${CREATORS.length} creators...`);
  const creatorResult = await worker.ingestCreatorBatch(supabase, CREATORS);
  console.log(`  succeeded: ${creatorResult.succeeded}/${creatorResult.totalProcessed}`);
  for (const err of creatorResult.errors) {
    console.log(`  [${err.stage}] ${err.identifier}: ${err.message}`);
  }

  console.log(`\nSeeding ${ENTERPRISES.length} event promoters...`);
  const enterpriseResult = await worker.ingestEnterpriseBatch(supabase, ENTERPRISES);
  console.log(`  succeeded: ${enterpriseResult.succeeded}/${enterpriseResult.totalProcessed}`);
  for (const err of enterpriseResult.errors) {
    console.log(`  [${err.stage}] ${err.identifier}: ${err.message}`);
  }

  const totalFailed = creatorResult.failed + enterpriseResult.failed;
  if (totalFailed > 0) {
    console.error(`\n${totalFailed} record(s) failed to seed — see errors above.`);
    process.exitCode = 1;
    return;
  }

  console.log('\nSeed complete.');
}

main().catch((err) => {
  console.error('Seed script crashed:', err);
  process.exitCode = 1;
});
