import Image from 'next/image';
import Link from 'next/link';
import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  CheckCircle2,
  Clapperboard,
  ClipboardList,
  FileStack,
  Handshake,
  ListChecks,
  MapPin,
  PartyPopper,
  ShieldCheck,
  Sparkles,
  Sprout,
} from 'lucide-react';

import { GovernanceFooter } from '@/components/discover/governance-footer';
import { LandingCtas } from '@/components/marketing/landing-ctas';
import { RevealOnScroll } from '@/components/marketing/reveal-on-scroll';
import { StudioLedger } from '@/components/marketing/studio-ledger';
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

// Real regional hubs + vendor categories the platform actually models — used
// as the hero's coverage ticker instead of fabricated partner/venue logos.
const COVERAGE_TICKER = [
  'DALLAS – FORT WORTH',
  'DJ & SOUND',
  'WASHINGTON D.C. / MD / VA',
  'DANCE TROUPE',
  'AUSTIN',
  'STAGE EMCEE',
  'HOUSTON',
  'EVENT PLANNER',
  'CHARLOTTE & THE CAROLINAS',
  'CONTENT CREATOR',
] as const;

// The real, current path from a cold start to a booked vendor — matches
// what's actually shipped (Outreach Brief, hasCulturalSignal() gate, the
// Talent Desk / Concierge Hand-off flow), not a roadmap.
const PIPELINE_STEPS = [
  {
    icon: ClipboardList,
    title: 'Build Talent Brief',
    body: 'Event date, regional hub, and the specs that actually matter — genre, guest count, venue scale.',
    badge: 'DMV Core',
  },
  {
    icon: ShieldCheck,
    title: 'Cultural Intelligence',
    body: 'Every candidate is gated on real South Asian/Desi relevance and dialect fluency, not just a bookable role.',
    badge: 'Verified Reach',
  },
  {
    icon: Handshake,
    title: 'Desk Concierge',
    body: 'Verified rates, availability, and tech riders — or a routed introduction when the desk isn’t public.',
    badge: 'Approved',
  },
  {
    icon: PartyPopper,
    title: 'Production Execution',
    body: 'Confirm terms and coordinate every detail — baraat entrance to sangeet set times — directly with your desk.',
    badge: 'Confirmed',
  },
] as const;

// Proposed second product line — regional promotional campaigns using the
// same discovered solo_creator pool, sold to a different buyer. Not built:
// no campaign, delivery-tracking, or billing tables exist yet. Landing-page
// + lead-capture only, to gauge demand before committing engineering time.
const CAMPAIGN_BLOCKS = [
  {
    icon: Clapperboard,
    title: 'Event Hype Flights',
    body: 'Multi-creator Reel pushes leading up to a festival or concert date.',
  },
  {
    icon: MapPin,
    title: 'Local Business Activations',
    body: 'In-person visits and geo-tagged reviews for restaurants, boutiques, and regional sponsors.',
  },
  {
    icon: FileStack,
    title: 'Zero Agency Overhead',
    body: 'Standardized briefs, tracked delivery proof, and consolidated billing.',
  },
] as const;

const FIT_SIGNALS = [
  { icon: CalendarClock, text: 'Booking 3+ vendors per wedding season' },
  { icon: MapPin, text: 'Working across multiple regional hubs' },
  { icon: AlertTriangle, text: 'Tired of double-booked vendors' },
  { icon: Banknote, text: 'Want real rates, not Instagram guesswork' },
  { icon: ListChecks, text: 'Juggling separate lists per vendor type' },
] as const;

const FAQ_ITEMS = [
  {
    q: 'Why only South Asian / Desi event vendors, not creators in general?',
    a: 'Because a generic creator database can’t tell a Bhangra DJ from a Bollywood DJ, or check whether a dance troupe is already booked for a wedding the same weekend. Those are the actual questions a Desi wedding needs answered, and they only work with a directory built around this community specifically — not a filter bolted onto a general-purpose tool.',
  },
  {
    q: 'Which cities do you cover?',
    a: 'Dallas–Fort Worth, Washington D.C./MD/VA, Austin, Houston, and Charlotte/the Carolinas — discovered weekly via an automated pipeline, with coverage expanding as new regional hashtag sets are added.',
  },
  {
    q: 'How is a profile verified — is it AI?',
    a: 'Both, in that order. A deterministic keyword pass handles every discovered account first — free, instant, and tuned against real data, including a required South Asian/Desi cultural-relevance check, not just a bookable role. Only the handful it can’t confidently place get a second look from Claude, which either confirms a real category or agrees it’s not an event professional. Nothing gets in on a guess from either step, and the AI never overrides a rejection the keyword pass got right.',
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
    a: 'Whether you’d be booking direct or through a rep — Direct Manager Desk, Talent Agency Desk, Self-Represented Desk, or Independent/Inquire for Representation — inferred from how their bio lists contact info, so you know who you’re actually talking to before the first message.',
  },
  {
    q: 'What does a credit unlock?',
    a: 'Browsing, filtering, and dossiers are free. A credit unlocks a specific vendor’s direct booking desk (email/phone) so you can reach out without going through Instagram DMs — and when a direct line isn’t on file, the desk routes your inquiry to our concierge instead of a dead end.',
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
    <main className="min-h-screen bg-[#F7F4EE] text-[#1D1714]">
      {/* Nav */}
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[#DDD5C7] bg-[#F7F4EE]/90 px-4 backdrop-blur-md sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#BA5D2C]/30 bg-[#BA5D2C]/10">
            <Sparkles className="h-4 w-4 text-[#BA5D2C]" />
          </div>
          <span className="font-sans text-sm font-bold tracking-tight text-[#1D1714]">
            PULSEGRID<sup className="text-[9px]">™</sup>{' '}
            <span className="hidden font-normal text-[#7A6E65] sm:inline">
              | Event Production &amp; Cultural Media Intelligence OS
            </span>
          </span>
        </Link>
        {/* Hidden below sm: at narrow widths this pair wraps and gets clipped by the nav's fixed height — the identical CTA pair is already the first thing visible in the hero immediately below, so nothing is lost. */}
        <div className="hidden sm:block">
          <LandingCtas size="sm" />
        </div>
      </div>

      {/* Asymmetric Studio Hero */}
      <section className="border-b border-[#DDD5C7] px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-16">
          {/* Left column — 60% */}
          <div>
            <span className="font-mono text-xs font-semibold tracking-[0.2em] text-[#BA5D2C]">
              [ CULTURAL PRODUCTION DESK &bull; DFW &bull; DMV &bull; ATX &bull; HOU &bull; CLT ]
            </span>
            <h1 className="mt-5 text-balance font-sans text-4xl font-semibold leading-[1.08] tracking-tight text-[#1D1714] sm:text-5xl lg:text-6xl">
              Talent intelligence for high-stakes cultural stages.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-[#7A6E65] sm:text-lg">
              A curated roster of verified Baraat DJs, stage emcees, dance troupes, and luxury event producers —
              genre-matched, conflict-checked, and ready to book.
            </p>
            <div className="mt-9">
              <LandingCtas size="lg" align="start" />
            </div>

            <div className="mt-14 grid max-w-md grid-cols-3 gap-4 border-t border-[#DDD5C7] pt-8">
              <Stat value={stats.total > 0 ? `${stats.total}+` : 'Growing'} label="Verified vendors" />
              <Stat value="5" label="Regional hubs" />
              <Stat value="Weekly" label="Automated discovery" />
            </div>
          </div>

          {/* Right column — 40%, architectural portrait frame */}
          <div className="relative mx-auto w-full max-w-sm lg:max-w-none">
            <div className="relative aspect-[4/5] overflow-hidden rounded-2xl border border-[#DDD5C7] shadow-2xl shadow-stone-900/10">
              <Image
                src="https://images.unsplash.com/photo-1463592177119-bab2a00f3ccb?auto=format&fit=crop&w=1200&q=80"
                alt=""
                fill
                sizes="(max-width: 1024px) 384px, 40vw"
                className="object-cover"
                priority
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#1D1714]/60 via-transparent to-transparent" />
              <span className="absolute bottom-4 left-4 right-4 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-[#1D1714]/70 px-3 py-1.5 text-xs font-semibold text-[#F7F4EE] backdrop-blur-sm">
                <MapPin className="h-3.5 w-3.5 text-[#E5C378]" />
                Austin &bull; Telugu / Bollywood Live
              </span>
            </div>
          </div>
        </div>

        {/* Coverage ticker — real hubs + categories, not invented partner logos */}
        <div className="relative mx-auto mt-16 max-w-5xl overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
          <div className="flex w-max animate-marquee items-center gap-10 whitespace-nowrap">
            {[...COVERAGE_TICKER, ...COVERAGE_TICKER].map((label, i) => (
              <span key={`${label}-${i}`} className="text-xs font-semibold tracking-[0.2em] text-[#7A6E65]">
                {label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Studio Ledger — production roster spec sheet, replaces a boxy 5-card grid */}
      <section className="px-4 py-20 sm:px-6 sm:py-28">
        <RevealOnScroll className="mx-auto max-w-4xl">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <span className="font-mono text-xs font-semibold tracking-[0.2em] text-[#BA5D2C]">
                [ PRODUCTION ROSTER SPEC SHEET ]
              </span>
              <h2 className="mt-2 font-sans text-3xl font-semibold tracking-tight text-[#1D1714] sm:text-4xl">
                Five categories, one directory.
              </h2>
            </div>
            <p className="max-w-xs text-sm text-[#7A6E65]">
              Every category tracks what actually matters for booking it — tap a row for the spec.
            </p>
          </div>
          <div className="mt-10">
            <StudioLedger />
          </div>
        </RevealOnScroll>
      </section>

      {/* Wedding-season pain point */}
      <section className="border-t border-[#DDD5C7] bg-[#EDE7DC] px-4 py-20 sm:px-6 sm:py-28">
        <RevealOnScroll className="mx-auto max-w-3xl text-center">
          <h2 className="font-sans text-2xl font-semibold tracking-tight text-[#1D1714] sm:text-3xl">
            Peak season, the good ones are already booked.
          </h2>
          <p className="mt-5 text-[#7A6E65]">
            A hashtag search can’t tell you whether a DJ actually plays Bhangra as well as Bollywood, whether a
            dance troupe already has a wedding the same weekend, or whether that Instagram bio is a real rate or
            a guess. PulseGrid checks all three before you ever send a message.
          </p>
        </RevealOnScroll>
      </section>

      {/* See it in action — an authentic dossier preview with real media, real field labels */}
      <section className="mx-auto max-w-5xl px-4 py-20 sm:px-6 sm:py-28">
        <RevealOnScroll>
          <h2 className="text-center font-sans text-3xl font-semibold tracking-tight text-[#1D1714] sm:text-4xl">
            The Full Dossier
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-sm text-[#7A6E65]">
            Every result opens into this — not just a profile picture and a follower count. Tech rider notes, real
            media proof from their own posts, and dialect fluency, alongside reach and rate.
          </p>

          <div className="relative mx-auto mt-10 max-w-2xl overflow-hidden rounded-2xl border border-[#DDD5C7] shadow-xl shadow-stone-900/5">
            <Image
              src="https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=1200&q=80"
              alt=""
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-[#1D1714]/80" />

            <div className="relative p-6">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-300">Illustrative example</p>
              <div className="mt-2 flex items-center gap-3">
                <div className="h-12 w-12 rounded-full border border-white/15 bg-white/5" />
                <div>
                  <p className="text-sm font-bold text-white">Sample DJ Profile</p>
                  <p className="text-xs text-stone-300">@example_dj · DFW · DJ &amp; Sound</p>
                </div>
                <span className="ml-auto rounded-full border border-[#E5C378]/30 bg-[#E5C378]/10 px-2.5 py-1 text-[10px] font-bold text-[#E5C378]">
                  85% Match
                </span>
              </div>

              <div className="mt-5 flex flex-wrap gap-2 border-t border-white/10 pt-5">
                <Tag>DFW Core</Tag>
                <Tag>Dialects: Hindi &amp; Telugu</Tag>
                <Tag>Tech Rider: Pioneer CDJ-3000 + Wireless Mics</Tag>
                <Tag icon={CheckCircle2} tone="cleared">
                  Exclusivity Cleared
                </Tag>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-4 border-t border-white/10 pt-5 sm:grid-cols-4">
                <MockStat label="REACH" value="12.4K" />
                <MockStat label="ENGAGEMENT" value="6.2%" />
                <MockStat label="EST. RATE" value="$300–$900" />
                <MockStat label="GENRE" value="Bollywood" />
              </div>
            </div>
          </div>
        </RevealOnScroll>
      </section>

      {/* 4-step production pipeline — connected timeline */}
      <section className="border-t border-[#DDD5C7] bg-[#EDE7DC] px-4 py-20 sm:px-6 sm:py-28">
        <RevealOnScroll className="mx-auto max-w-5xl">
          <div className="text-center">
            <h2 className="font-sans text-3xl font-semibold tracking-tight text-[#1D1714] sm:text-4xl">
              From brief to booked lineup.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm text-[#7A6E65]">
              Discovery, cultural vetting, and desk routing are live today — here’s the actual path from a cold
              start to a confirmed vendor.
            </p>
          </div>

          <div className="relative mt-16">
            <div className="absolute left-5 top-0 h-full w-px bg-[#DDD5C7] sm:left-0 sm:top-5 sm:h-px sm:w-full" />
            <div className="relative grid grid-cols-1 gap-10 sm:grid-cols-4 sm:gap-6">
              {PIPELINE_STEPS.map((step, i) => (
                <div key={step.title} className="relative flex gap-4 sm:flex-col sm:items-center sm:gap-0 sm:text-center">
                  <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#BA5D2C]/40 bg-[#F7F4EE] text-sm font-bold text-[#BA5D2C]">
                    0{i + 1}
                  </div>
                  <div className="sm:mt-5">
                    <span className="inline-block rounded-full border border-[#BA5D2C]/30 bg-[#BA5D2C]/10 px-2.5 py-0.5 text-[10px] font-bold tracking-wide text-[#BA5D2C]">
                      {step.badge}
                    </span>
                    <h3 className="mt-2.5 text-base font-bold text-[#1D1714]">{step.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-[#7A6E65] sm:mx-auto sm:max-w-[210px]">{step.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </RevealOnScroll>
      </section>

      {/* Regional Media & Creator Ad Desks — proposed second product line, not built */}
      <section className="border-t border-[#DDD5C7] px-4 py-20 sm:px-6 sm:py-28">
        <RevealOnScroll className="mx-auto max-w-6xl">
          <div className="text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#DDD5C7] bg-[#EDE7DC] px-3 py-1 text-xs font-semibold text-[#7A6E65]">
              Coming soon
            </span>
            <h2 className="mt-3 font-sans text-3xl font-semibold tracking-tight text-[#1D1714] sm:text-4xl">
              Turn local reach into sold-out venues &amp; foot traffic.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm text-[#7A6E65]">
              Deploy curated rosters of trusted regional creators for pre-event hype, venue walkthroughs, and
              targeted localized sponsor campaigns — Regional Media &amp; Creator Ad Desks, built on the same
              verified directory.
            </p>
          </div>
          <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
            {CAMPAIGN_BLOCKS.map((block) => (
              <div
                key={block.title}
                className="rounded-2xl border border-[#DDD5C7] bg-[#EDE7DC] p-6 transition-all duration-300 hover:-translate-y-1 hover:border-[#BA5D2C]/40"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#BA5D2C]/20 bg-[#BA5D2C]/10">
                  <block.icon className="h-5 w-5 text-[#BA5D2C]" />
                </div>
                <h3 className="mt-4 text-base font-bold text-[#1D1714]">{block.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#7A6E65]">{block.body}</p>
              </div>
            ))}
          </div>
          <p className="mx-auto mt-6 max-w-xl text-center text-xs text-[#7A6E65]/70">
            Tell us if this is what you need — select it under &ldquo;Production Needs&rdquo; when you request an
            Agency Pass, and we’ll prioritize building it based on real demand.
          </p>
        </RevealOnScroll>
      </section>

      {/* Honest current-state stats, in place of fabricated testimonials */}
      <section className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 sm:py-28">
        <RevealOnScroll>
          <Sprout className="mx-auto h-6 w-6 text-[#BA5D2C]" />
          <h2 className="mt-4 font-sans text-xl font-semibold tracking-tight text-[#1D1714]">Early, and growing every week</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-[#7A6E65]">
            PulseGrid is early-stage — {stats.total > 0 ? `${stats.total} verified vendors` : 'a growing directory'}{' '}
            today, across five regional hubs, added to automatically every week. We’d rather tell you that honestly
            than show you logos we don’t have yet.
          </p>
        </RevealOnScroll>
      </section>

      {/* FAQ */}
      <section className="border-t border-[#DDD5C7] bg-[#EDE7DC] px-4 py-20 sm:px-6 sm:py-28">
        <RevealOnScroll className="mx-auto max-w-2xl">
          <h2 className="text-center font-sans text-3xl font-semibold tracking-tight text-[#1D1714] sm:text-4xl">
            Frequently asked questions
          </h2>
          <div className="mt-8 divide-y divide-[#DDD5C7]">
            {FAQ_ITEMS.map((item) => (
              <details key={item.q} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-[#1D1714] transition-colors hover:text-[#BA5D2C]">
                  {item.q}
                  <span className="ml-4 text-[#7A6E65] transition-transform duration-200 group-open:rotate-45">+</span>
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-[#7A6E65]">{item.a}</p>
              </details>
            ))}
          </div>
        </RevealOnScroll>
      </section>

      {/* Fit qualifier */}
      <section className="border-t border-[#DDD5C7] px-4 py-20 sm:px-6 sm:py-28">
        <RevealOnScroll className="mx-auto max-w-4xl">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-[1fr_1.4fr] sm:items-start">
            <h2 className="font-sans text-3xl font-semibold tracking-tight text-[#1D1714] sm:text-4xl">
              Is PulseGrid right for you?
            </h2>
            <p className="text-sm leading-relaxed text-[#7A6E65]">
              A strong fit if you’re booking talent for South Asian weddings and events and need a faster way to
              find, vet, and confirm vendors — without juggling five separate Instagram searches per event.
            </p>
          </div>
          <div className="mt-8 divide-y divide-[#DDD5C7]/70 border-t border-[#DDD5C7]">
            {FIT_SIGNALS.map((signal) => (
              <div key={signal.text} className="-mx-2 flex items-center gap-4 rounded-lg px-2 py-4 transition-colors hover:bg-[#EDE7DC]">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#BA5D2C]/20 bg-[#BA5D2C]/10">
                  <signal.icon className="h-4 w-4 text-[#BA5D2C]" />
                </div>
                <p className="text-sm font-medium text-[#1D1714]">{signal.text}</p>
              </div>
            ))}
          </div>
        </RevealOnScroll>
      </section>

      {/* Closing CTA */}
      <section className="border-t border-[#DDD5C7] bg-[#EDE7DC] px-4 py-20 text-center sm:px-6 sm:py-28">
        <RevealOnScroll>
          <h2 className="font-sans text-4xl font-semibold leading-[1.05] tracking-tight text-[#1D1714] sm:text-6xl">
            Book with confidence, <br className="hidden sm:block" />
            not a guess.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-sm text-[#7A6E65]">
            No trial gimmicks, no credit card — browse the directory free, request an Agency Pass when you need
            direct desks.
          </p>
          <div className="mt-9 flex justify-center">
            <LandingCtas size="lg" />
          </div>
        </RevealOnScroll>
      </section>

      <GovernanceFooter />
    </main>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-2xl font-bold text-[#1D1714]">{value}</p>
      <p className="mt-1 text-xs text-[#7A6E65]">{label}</p>
    </div>
  );
}

function MockStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold tracking-wider text-stone-300">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-white">{value}</p>
    </div>
  );
}

function Tag({
  children,
  icon: Icon,
  tone = 'default',
}: {
  children: React.ReactNode;
  icon?: typeof CheckCircle2;
  tone?: 'default' | 'cleared';
}) {
  const toneClasses = tone === 'cleared' ? 'border-[#4ADE80]/30 bg-[#4ADE80]/10 text-[#86EFAC]' : 'border-white/15 bg-white/5 text-stone-200';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${toneClasses}`}>
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {children}
    </span>
  );
}
