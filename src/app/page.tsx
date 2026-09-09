import { Check, Music2, Mic2, PartyPopper, Sparkles, Users, X } from 'lucide-react';
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
    a: 'Every entity is discovered from real, public Instagram activity, then classified by what they actually say about themselves — not guessed. Profiles with no real signal of being an event professional are never added.',
  },
  {
    q: 'What does a credit unlock?',
    a: 'Browsing, filtering, and dossiers are free. A credit unlocks a specific creator’s direct booking desk (email/phone) so you can reach out without going through Instagram DMs.',
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
          <div className="mt-10 overflow-hidden rounded-2xl border border-zinc-200">
            <div className="grid grid-cols-2">
              <div className="border-b border-r border-zinc-200 bg-zinc-50 px-5 py-3 text-sm font-bold text-zinc-500">
                Old way
              </div>
              <div className="border-b border-zinc-200 bg-emerald-50 px-5 py-3 text-sm font-bold text-emerald-700">
                PulseGrid way
              </div>
              {COMPARISON_ROWS.map((row) => (
                <Fragment key={row.old}>
                  <div className="flex items-start gap-2 border-b border-r border-zinc-200 px-5 py-4 text-sm text-zinc-600">
                    <X className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                    {row.old}
                  </div>
                  <div className="flex items-start gap-2 border-b border-zinc-200 bg-emerald-50/40 px-5 py-4 text-sm text-zinc-800">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    {row.pulsegrid}
                  </div>
                </Fragment>
              ))}
            </div>
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
      <section className="bg-zinc-900 px-4 py-16 text-center sm:px-6">
        <h2 className="text-2xl font-bold text-white sm:text-3xl">Bring your next Desi event under one roof</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-zinc-400">
          Sign in to browse the DFW directory, or request an Agency Pass for full desk access.
        </p>
        <div className="mt-7 flex justify-center">
          <LandingCtas size="md" />
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
