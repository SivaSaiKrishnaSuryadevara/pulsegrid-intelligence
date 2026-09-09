import { AlertTriangle, Check, Music2, Mic2, PartyPopper, ShieldCheck, Sparkles, Users, X } from 'lucide-react';
import { Fragment } from 'react';

import { GovernanceFooter } from '@/components/discover/governance-footer';
import { LandingCtas } from '@/components/marketing/landing-ctas';
import { getServiceRoleClient } from '@/lib/supabase/service';
import type { EntityType } from '@/types/creator';

export const revalidate = 3600; // live counts refresh hourly — no need to rebuild on every request for a marketing page

interface LandingStats {
  total: number;
  byType: Partial<Record<EntityType, number>>;
}

async function getLandingStats(): Promise<LandingStats> {
  try {
    const supabase = getServiceRoleClient();
    const { data, error } = await supabase.from('production_entities').select('entity_type');
    if (error || !data) return { total: 0, byType: {} };
    const byType: Partial<Record<EntityType, number>> = {};
    for (const row of data as { entity_type: EntityType }[]) {
      byType[row.entity_type] = (byType[row.entity_type] ?? 0) + 1;
    }
    return { total: data.length, byType };
  } catch {
    return { total: 0, byType: {} };
  }
}

const FEATURE_BLOCKS = [
  {
    color: 'bg-violet-100',
    icon: Music2,
    title: 'Match with the right talent, instantly',
    body: 'Filter by entity type — DJ & Sound, Dance Troupe, Stage Emcee, Event Planner, Solo Creator — plus dialect, genre, engagement rate, and metro. No more scrolling five hashtags by hand.',
  },
  {
    color: 'bg-pink-100',
    icon: Mic2,
    title: 'Vet before you ever reach out',
    body: 'Every profile carries a Full Dossier: real reach and engagement, estimated rate range, media proof from their own recent posts, and an Exclusivity Radar flag if they’re already booked in your category.',
  },
  {
    color: 'bg-orange-100',
    icon: PartyPopper,
    title: 'Turn one booking into a full roster',
    body: 'Shortlist across every entity type at once, see the blended budget and combined reach for the whole lineup, and export a white-label PDF roster to send straight to your client.',
  },
] as const;

const COMPARISON_ROWS = [
  { old: 'Manually searching Instagram hashtags for hours', pulsegrid: 'One search across a verified, classified directory' },
  { old: 'Guessing whether engagement numbers are real', pulsegrid: 'Computed engagement rate from their own recent posts' },
  { old: 'No way to tell if they’re already booked for a rival event', pulsegrid: 'Exclusivity Radar flags active category conflicts' },
  { old: 'Cold DMs with no context', pulsegrid: 'Deterministic Outreach Brief generated from your event details' },
  { old: 'A different vendor list for every entity type', pulsegrid: 'DJs, dance troupes, emcees, planners, and creators — one roster' },
] as const;

const FAQ_ITEMS = [
  {
    q: 'Is PulseGrid only for South Asian / Desi talent right now?',
    a: 'Yes — for this stage, PulseGrid is deliberately focused on Desi event talent and audiences (DJs, dance troupes, emcees, planners, and creators serving South Asian weddings and cultural events). Broader coverage may come later, but the discovery pipeline, classification, and dialect filters are all tuned for this community first.',
  },
  {
    q: 'Which cities do you cover?',
    a: 'Dallas-Fort Worth (DFW) is the active market today, discovered weekly via an automated pipeline. Coverage expands as new regional hashtag sets are added.',
  },
  {
    q: 'How is a profile verified?',
    a: 'Every entity is discovered from real, public Instagram activity, then classified by what they actually say about themselves — bio and display-name phrasing like "DJ," "Event Planning," or "Content Creator" — not guessed. Profiles with no real signal of being an event professional are never added, even if a tracked hashtag surfaced them.',
  },
  {
    q: 'How is engagement rate calculated?',
    a: 'From that creator’s own recent posts — total likes and comments divided by post count and follower count — not a self-reported number. Small local vendors naturally run lower engagement than mega-influencers; we don’t hide them for it.',
  },
  {
    q: 'Can I tell if a creator already has a conflicting booking?',
    a: 'Yes — the Exclusivity Radar flags active category-blackout windows, so you can see upfront if someone’s already committed to a rival brand or event in your category before you reach out.',
  },
  {
    q: 'What’s a "Desk Status"?',
    a: 'Whether you’d be booking direct or through a rep — Direct Manager Desk, Talent Agency Desk, Self-Represented Desk, or Unverified Desk — inferred from how their bio lists contact info, so you know who you’re actually talking to before the first message.',
  },
  {
    q: 'What does a credit unlock?',
    a: 'Browsing, filtering, and dossiers are free. A credit unlocks a specific creator’s direct booking desk (email/phone) so you can reach out without going through Instagram DMs.',
  },
  {
    q: 'Can I export a roster to send to a client?',
    a: 'Yes — shortlist across DJs, dance troupes, emcees, planners, and creators in one roster, then export a white-label PDF with the full lineup, aggregate reach, and blended budget.',
  },
  {
    q: 'Can a creator ask to be removed?',
    a: 'Yes — every profile links to a Creator Opt-Out / Claim Profile flow in the footer, handled directly by our team.',
  },
] as const;

export default async function LandingPage() {
  const stats = await getLandingStats();

  return (
    <main className="min-h-screen bg-[#F8F9FA] text-zinc-900">
      {/* Nav */}
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-zinc-200/80 bg-white/80 px-4 backdrop-blur-md sm:px-6">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-bold tracking-tight text-zinc-900">
            PULSEGRID<sup className="text-[9px]">™</sup>{' '}
            <span className="hidden font-normal text-zinc-500 sm:inline">| Event Talent &amp; Media Intelligence</span>
          </span>
        </div>
        <LandingCtas size="sm" />
      </div>

      {/* Hero */}
      <section className="mx-auto max-w-4xl px-4 pb-16 pt-20 text-center sm:px-6">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
          <Sparkles className="h-3 w-3" /> Built for South Asian &amp; Desi events
        </span>
        <h1 className="mt-5 text-4xl font-bold tracking-tight text-zinc-900 sm:text-5xl">
          Verified Desi Event Talent,
          <br />
          Searchable In One Place
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base text-zinc-600 sm:text-lg">
          Stop scrolling Instagram hashtags for wedding DJs, dance troupes, and emcees. PulseGrid discovers, verifies,
          and classifies real South Asian event talent — with reach, rates, and booking desks in one dossier.
        </p>
        <div className="mt-8 flex justify-center">
          <LandingCtas size="lg" />
        </div>

        <div className="mx-auto mt-14 grid max-w-2xl grid-cols-3 gap-4 border-t border-zinc-200 pt-8">
          <Stat value={stats.total > 0 ? `${stats.total}+` : 'Growing'} label="Verified DFW profiles" />
          <Stat value="5" label="Talent categories" />
          <Stat value="Weekly" label="Automated discovery" />
        </div>
      </section>

      {/* Problem */}
      <section className="border-y border-zinc-200 bg-white px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-2xl font-bold text-zinc-900 sm:text-3xl">
            Scrolling Instagram for hours, found 3 maybes — and they still need vetting
          </h2>
          <p className="mt-4 text-zinc-600">
            Hashtags surface anyone who posted once, not who’s actually a working DJ, dance troupe, or emcee.
            Every lead still means checking real engagement, real rates, and whether they’re already booked
            against you.
          </p>
        </div>
      </section>

      {/* Feature blocks */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-center text-2xl font-bold text-zinc-900 sm:text-3xl">
          Find talent worth your time, without the guesswork
        </h2>
        <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
          {FEATURE_BLOCKS.map((block) => (
            <div key={block.title} className={`rounded-2xl ${block.color} p-6`}>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/70">
                <block.icon className="h-5 w-5 text-zinc-800" />
              </div>
              <h3 className="mt-4 text-base font-bold text-zinc-900">{block.title}</h3>
              <p className="mt-2 text-sm text-zinc-700">{block.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Comparison */}
      <section className="border-y border-zinc-200 bg-white px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-2xl font-bold text-zinc-900 sm:text-3xl">Old way vs. PulseGrid way</h2>
          <div className="mt-10 grid grid-cols-1 overflow-hidden rounded-3xl sm:grid-cols-2">
            <div className="bg-zinc-100 p-6 sm:p-8">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-zinc-900">Old way</h3>
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-300">
                  <X className="h-4 w-4 text-zinc-700" />
                </span>
              </div>
              <ul className="mt-6 space-y-4">
                {COMPARISON_ROWS.map((row) => (
                  <li key={row.old} className="border-b border-zinc-200 pb-4 text-sm text-zinc-600 last:border-0">
                    {row.old}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-emerald-100 p-6 sm:p-8">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-emerald-900">PulseGrid way</h3>
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500">
                  <Check className="h-4 w-4 text-white" />
                </span>
              </div>
              <ul className="mt-6 space-y-4">
                {COMPARISON_ROWS.map((row) => (
                  <li key={row.pulsegrid} className="border-b border-emerald-200/70 pb-4 text-sm font-medium text-emerald-950 last:border-0">
                    {row.pulsegrid}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* See it in action — an annotated mockup of the real dossier UI, using real field labels rather than a fabricated screenshot */}
      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <h2 className="text-center text-2xl font-bold text-zinc-900 sm:text-3xl">See it in action</h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-sm text-zinc-600">
          Every result opens into a Full Dossier — not just a profile picture and a follower count.
        </p>

        <div className="relative mx-auto mt-10 max-w-2xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Illustrative example</p>
          <div className="mt-2 flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-zinc-200" />
            <div>
              <p className="text-sm font-bold text-zinc-900">Sample DJ Profile</p>
              <p className="text-xs text-zinc-500">@example_dj · DFW · DJ &amp; Sound</p>
            </div>
            <span className="ml-auto rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">
              85% Match
            </span>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-zinc-100 pt-5 sm:grid-cols-4">
            <MockStat label="REACH" value="12.4K" />
            <MockStat label="ENGAGEMENT" value="6.2%" />
            <MockStat label="EST. RATE" value="$300–$900" />
            <MockStat label="GENRE" value="Bollywood" />
          </div>

          <div className="relative mt-5 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-medium text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Exclusivity Radar: booked for a competing brand through Oct 12
          </div>

          <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
            <ShieldCheck className="h-3.5 w-3.5 text-zinc-400" />
            Self-Represented Desk · Deliverability Pending
          </div>

          {/* Annotation callout, Modash-style */}
          <div className="absolute -right-4 top-1/2 hidden w-56 -translate-y-1/2 translate-x-full rounded-2xl bg-zinc-900 p-4 text-xs text-white shadow-xl lg:block">
            <div className="absolute -left-2 top-1/2 h-4 w-4 -translate-y-1/2 rotate-45 bg-zinc-900" />
            See exactly why a booking might already be off the table — before you ever send a message.
          </div>
        </div>
      </section>

      {/* Honest current-state stats, in place of fabricated testimonials */}
      <section className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6">
        <Users className="mx-auto h-6 w-6 text-zinc-400" />
        <h2 className="mt-4 text-xl font-bold text-zinc-900">Early, and growing every week</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-zinc-600">
          PulseGrid is early-stage — {stats.total > 0 ? `${stats.total} verified DFW profiles` : 'a growing DFW directory'}{' '}
          today, added to automatically every week. We’d rather tell you that honestly than show you logos we
          don’t have yet.
        </p>
      </section>

      {/* FAQ */}
      <section className="border-t border-zinc-200 bg-white px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-center text-2xl font-bold text-zinc-900 sm:text-3xl">Frequently asked questions</h2>
          <div className="mt-8 divide-y divide-zinc-200">
            {FAQ_ITEMS.map((item) => (
              <details key={item.q} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-zinc-900">
                  {item.q}
                  <span className="ml-4 text-zinc-400 transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-2 text-sm text-zinc-600">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="bg-zinc-900 px-4 py-20 text-center sm:px-6">
        <h2 className="text-4xl font-black uppercase leading-[0.95] tracking-tight text-white sm:text-6xl">
          Bring Every Desi
          <br />
          Booking Under One Roof
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-sm text-zinc-400">
          No trial gimmicks, no credit card — browse the DFW directory free, request an Agency Pass when you need
          direct desks.
        </p>
        <div className="mt-8 flex justify-center">
          <LandingCtas size="lg" />
        </div>
      </section>

      <GovernanceFooter />
    </main>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-2xl font-bold text-zinc-900">{value}</p>
      <p className="mt-1 text-xs text-zinc-500">{label}</p>
    </div>
  );
}

function MockStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold tracking-wider text-zinc-400">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-zinc-900">{value}</p>
    </div>
  );
}
