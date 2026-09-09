import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  Check,
  Handshake,
  ListChecks,
  Mic2,
  Music2,
  PartyPopper,
  ShieldCheck,
  Sparkles,
  Sprout,
  Users,
} from 'lucide-react';

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

// The five vendor categories PulseGrid actually models — each field listed
// here is a real column/entityDetails field, not aspirational copy. This
// category grid is the thing a general creator-discovery tool structurally
// can't have, since it has no concept of "entity type" at all.
const CATEGORY_BLOCKS = [
  {
    color: 'bg-amber-100',
    accent: 'text-amber-800',
    icon: Music2,
    title: 'DJ & Sound',
    body: 'Genre-matched to Bollywood, Bhangra, Garba, Tollywood, and more — plus set length, guest capacity, and sound-rig specs.',
  },
  {
    color: 'bg-fuchsia-100',
    accent: 'text-fuchsia-800',
    icon: Sparkles,
    title: 'Dance Troupe',
    body: 'Troupe size and style — Bollywood Fusion, Bharatanatyam, Garba/Raas — so you know who can actually fill your stage.',
  },
  {
    color: 'bg-indigo-100',
    accent: 'text-indigo-800',
    icon: Mic2,
    title: 'Stage Emcee',
    body: 'Bilingual hosts who can carry a full program — baraat to reception — without handing you a stranger mid-ceremony.',
  },
  {
    color: 'bg-rose-100',
    accent: 'text-rose-800',
    icon: PartyPopper,
    title: 'Event Planner',
    body: 'Venue scale from boutique to festival-sized, permit rating, and portfolio — not just a pretty Instagram grid.',
  },
  {
    color: 'bg-teal-100',
    accent: 'text-teal-800',
    icon: Users,
    title: 'Content Creator',
    body: 'Real reach and engagement for wedding coverage and cultural content — computed from their own posts, not self-reported.',
  },
] as const;

// Not live yet — see "Coming soon" eyebrow below. Framed as the actual
// booking journey for an event vendor, not a generic brand-campaign
// workflow (a rejected earlier draft mirrored a "Manage/Email/Track/Pay"
// SaaS pattern that doesn't match how a wedding vendor actually gets hired).
const JOURNEY_STEPS = [
  {
    icon: ListChecks,
    title: 'Shortlist',
    body: 'Compare vendors across every category side by side — reach, rates, and rider specs in one view.',
  },
  {
    icon: Handshake,
    title: 'Request',
    body: 'Send a deterministic Outreach Brief built from your event date and details — no blank-page cold DM.',
  },
  {
    icon: CalendarClock,
    title: 'Confirm',
    body: 'Track the reply and hold the date, with the same Exclusivity Radar checking for new conflicts.',
  },
  {
    icon: Banknote,
    title: 'Deposit',
    body: 'Handle the deposit without a separate invoicing tool or a trail of Venmo screenshots.',
  },
] as const;

const FIT_SIGNALS = [
  {
    number: '01',
    label: 'Volume',
    chips: ['Booking 3+ vendors per wedding season', 'Working across multiple DFW venues', 'Expanding beyond one event type'],
  },
  {
    number: '02',
    label: 'The actual pain',
    chips: ['Tired of double-booked vendors', 'Want real rates, not Instagram guesswork', 'Juggling separate lists per vendor type'],
  },
] as const;

const FAQ_ITEMS = [
  {
    q: 'Why only South Asian / Desi event vendors, not creators in general?',
    a: 'Because a generic creator database can’t tell a Bhangra DJ from a Bollywood DJ, or check whether a dance troupe is already booked for a wedding the same weekend. Those are the actual questions a Desi wedding needs answered, and they only work with a directory built around this community specifically — not a filter bolted onto a general-purpose tool.',
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
    a: 'From that vendor’s own recent posts — total likes and comments divided by post count and follower count — not a self-reported number. Small local vendors naturally run lower engagement than mega-influencers; we don’t hide them for it.',
  },
  {
    q: 'Can I tell if a vendor is already booked the same weekend?',
    a: 'Yes — the Exclusivity Radar flags active category-blackout windows, so you can see upfront if someone’s already committed to another event in your category before you reach out. This matters most exactly when it matters most: peak wedding season.',
  },
  {
    q: 'What’s a "Desk Status"?',
    a: 'Whether you’d be booking direct or through a rep — Direct Manager Desk, Talent Agency Desk, Self-Represented Desk, or Unverified Desk — inferred from how their bio lists contact info, so you know who you’re actually talking to before the first message.',
  },
  {
    q: 'What does a credit unlock?',
    a: 'Browsing, filtering, and dossiers are free. A credit unlocks a specific vendor’s direct booking desk (email/phone) so you can reach out without going through Instagram DMs.',
  },
  {
    q: 'Can I export a roster to send to a client?',
    a: 'Yes — shortlist across DJs, dance troupes, emcees, planners, and creators in one roster, then export a white-label PDF with the full lineup, aggregate reach, and blended budget.',
  },
  {
    q: 'Can a vendor ask to be removed?',
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
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
          <Sparkles className="h-3 w-3" /> The vendor desk for South Asian weddings &amp; events
        </span>
        <h1 className="mt-5 text-4xl font-bold tracking-tight text-zinc-900 sm:text-5xl">
          Book the Right DJ, Dance Troupe,
          <br />
          or Emcee — Not a Maybe
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base text-zinc-600 sm:text-lg">
          Every Desi wedding season, the same vendors get double-booked and the same Instagram DMs go unanswered.
          PulseGrid is a verified directory built specifically for South Asian event vendors — genre-matched,
          conflict-checked, and ready to book.
        </p>
        <div className="mt-8 flex justify-center">
          <LandingCtas size="lg" />
        </div>

        <div className="mx-auto mt-14 grid max-w-2xl grid-cols-3 gap-4 border-t border-zinc-200 pt-8">
          <Stat value={stats.total > 0 ? `${stats.total}+` : 'Growing'} label="Verified DFW vendors" />
          <Stat value="5" label="Vendor categories" />
          <Stat value="Weekly" label="Automated discovery" />
        </div>
      </section>

      {/* Category grid — the structural difference: entity-type-aware vendor categories, not a generic creator list */}
      <section className="border-y border-zinc-200 bg-white px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-2xl font-bold text-zinc-900 sm:text-3xl">Five vendor categories, one directory</h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-sm text-zinc-600">
            Every category tracks what actually matters for booking it — not a one-size-fits-all creator profile.
          </p>
          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {CATEGORY_BLOCKS.map((block) => (
              <div key={block.title} className={`rounded-2xl ${block.color} p-6`}>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/70">
                  <block.icon className={`h-5 w-5 ${block.accent}`} />
                </div>
                <h3 className="mt-4 text-base font-bold text-zinc-900">{block.title}</h3>
                <p className="mt-2 text-sm text-zinc-700">{block.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Wedding-season pain point — specific to the actual booking problem, not a generic SaaS "old way" trope */}
      <section className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-2xl font-bold text-zinc-900 sm:text-3xl">
            Peak season, the good ones are already booked
          </h2>
          <p className="mt-4 text-zinc-600">
            A hashtag search can’t tell you whether a DJ actually plays Bhangra as well as Bollywood, whether a
            dance troupe already has a wedding the same weekend, or whether that Instagram bio is a real rate or
            a guess. PulseGrid checks all three before you ever send a message.
          </p>
        </div>
      </section>

      {/* See it in action — an annotated mockup of the real dossier UI, using real field labels rather than a fabricated screenshot */}
      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <h2 className="text-center text-2xl font-bold text-zinc-900 sm:text-3xl">The Full Dossier</h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-sm text-zinc-600">
          Every result opens into this — not just a profile picture and a follower count.
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
            Exclusivity Radar: already booked for a wedding through Oct 12
          </div>

          <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
            <ShieldCheck className="h-3.5 w-3.5 text-zinc-400" />
            Self-Represented Desk · Deliverability Pending
          </div>

          <div className="absolute -right-4 top-1/2 hidden w-56 -translate-y-1/2 translate-x-full rounded-2xl bg-zinc-900 p-4 text-xs text-white shadow-xl lg:block">
            <div className="absolute -left-2 top-1/2 h-4 w-4 -translate-y-1/2 rotate-45 bg-zinc-900" />
            See exactly why a booking might already be off the table — before you ever send a message.
          </div>
        </div>
      </section>

      {/* Booking journey — not live yet, framed as an actual vendor-booking flow, not a brand-campaign workflow */}
      <section className="border-t border-zinc-200 bg-white px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-500">
              Coming soon
            </span>
            <h2 className="mt-3 text-2xl font-bold text-zinc-900 sm:text-3xl">From shortlist to signed lineup</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm text-zinc-600">
              Discovery and vetting are live today. We’re building the rest of the actual booking journey next.
            </p>
          </div>
          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {JOURNEY_STEPS.map((step, i) => (
              <div key={step.title} className="rounded-2xl border border-zinc-200 p-6">
                <span className="text-xs font-bold text-zinc-400">0{i + 1}</span>
                <div className="mt-2 flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100">
                  <step.icon className="h-5 w-5 text-zinc-700" />
                </div>
                <h3 className="mt-4 text-base font-bold text-zinc-900">{step.title}</h3>
                <p className="mt-2 text-sm text-zinc-700">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Honest current-state stats, in place of fabricated testimonials */}
      <section className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6">
        <Sprout className="mx-auto h-6 w-6 text-zinc-400" />
        <h2 className="mt-4 text-xl font-bold text-zinc-900">Early, and growing every week</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-zinc-600">
          PulseGrid is early-stage — {stats.total > 0 ? `${stats.total} verified DFW vendors` : 'a growing DFW directory'}{' '}
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

      {/* Fit qualifier — helps a PR/event agency self-identify rather than a generic "sign up" pitch */}
      <section className="border-t border-zinc-200 bg-white px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-4xl">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-[1fr_1.4fr] sm:items-start">
            <h2 className="text-2xl font-bold text-zinc-900 sm:text-3xl">Is PulseGrid right for you?</h2>
            <p className="text-sm text-zinc-600">
              A strong fit if you’re booking talent for South Asian weddings and events and need a faster way to
              find, vet, and confirm vendors — without juggling five separate Instagram searches per event.
            </p>
          </div>
          <div className="mt-8 divide-y divide-zinc-200 border-t border-zinc-200">
            {FIT_SIGNALS.map((group) => (
              <div key={group.number} className="grid grid-cols-1 gap-3 py-6 sm:grid-cols-[1fr_3fr] sm:items-center">
                <span className="text-2xl font-bold text-zinc-300">{group.number}</span>
                <div className="flex flex-wrap gap-2">
                  {group.chips.map((chip) => (
                    <span
                      key={chip}
                      className="inline-flex items-center gap-1.5 rounded-full bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-700"
                    >
                      <Check className="h-3 w-3 text-emerald-600" />
                      {chip}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="bg-zinc-900 px-4 py-20 text-center sm:px-6">
        <h2 className="text-4xl font-black uppercase leading-[0.95] tracking-tight text-white sm:text-6xl">
          Book With Confidence,
          <br />
          Not a Guess
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
