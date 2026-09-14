'use client';

import { ChevronDown, type LucideIcon, Mic2, Music2, PartyPopper, Sparkles, Users } from 'lucide-react';
import { useState } from 'react';

interface LedgerEntry {
  code: string;
  specCode: string;
  category: string;
  /** Illustrative example fields, using the real entityDetails vocabulary each category actually models — not a real creator's data, same "Illustrative example" convention used elsewhere on this page. */
  deliverables: string;
  metros: string;
  icon: LucideIcon;
  snapshot: [string, string][];
}

const LEDGER: LedgerEntry[] = [
  {
    code: '01',
    specCode: 'SOUND',
    category: 'Baraat & Live Audio',
    deliverables: 'Pioneer CDJ-3000 · 120min Baraat Set · Dual Wireless Mics',
    metros: 'DFW · DMV · ATX · HOU · CLT',
    icon: Music2,
    snapshot: [
      ['Genre Tags', 'Bollywood, Bhangra, Garba'],
      ['Avg. Reach', '12.4K'],
      ['Est. Rate', '$300–$900'],
      ['Max Capacity', '300 guests'],
    ],
  },
  {
    code: '02',
    specCode: 'STAGE',
    category: 'Dance Troupe & Choreography',
    deliverables: '8–12 Dancer Troupe · Sprung-Floor Rider · 6–8wk Booking Window',
    metros: 'DFW · DMV · ATX · HOU · CLT',
    icon: Sparkles,
    snapshot: [
      ['Style', 'Bollywood Fusion'],
      ['Troupe Size', '8–12 dancers'],
      ['Stage Rider', 'Sprung floor preferred'],
      ['Lead Time', '6–8 weeks'],
    ],
  },
  {
    code: '03',
    specCode: 'VOICE',
    category: 'Stage Emcee & Hosting',
    deliverables: 'Hindi / Telugu / English Fluency · Full-Day Coverage · < 24hr Response',
    metros: 'DFW · DMV · ATX · HOU · CLT',
    icon: Mic2,
    snapshot: [
      ['Dialect Tags', 'Hindi, Telugu, English'],
      ['Program Coverage', 'Full-day'],
      ['Desk Status', 'Self-Represented'],
      ['Typical Response', '< 24 hrs'],
    ],
  },
  {
    code: '04',
    specCode: 'VENUE',
    category: 'Event Planning & Production',
    deliverables: 'Mid–Grand Scale Venues · 92% Permit Rating · 40+ Weddings Produced',
    metros: 'DFW · DMV · ATX · HOU · CLT',
    icon: PartyPopper,
    snapshot: [
      ['Venue Scale', 'Mid-Scale 500–2,000'],
      ['Permit Rating', '92%'],
      ['Portfolio', '40+ weddings produced'],
      ['Lead Time', '3–6 months'],
    ],
  },
  {
    code: '05',
    specCode: 'MEDIA',
    category: 'Content Creator & Media',
    deliverables: 'Reel + Carousel Coverage · Brand-Partnership Ready · Media Kit on File',
    metros: 'DFW · DMV · ATX · HOU · CLT',
    icon: Users,
    snapshot: [
      ['Avg. Reach', '12.4K'],
      ['Engagement', '6.2%'],
      ['Niche', 'Cultural Events'],
      ['Est. Rate', '$300–$900'],
    ],
  },
];

/**
 * Production Roster Spec Sheet — a minimal editorial index table replacing
 * a uniform 5-card grid. Each row expands in place on click (works on
 * touch, not just hover) to a small illustrative snapshot, rather than
 * routing to a separate view.
 */
export function StudioLedger() {
  const [expandedCode, setExpandedCode] = useState<string | null>(LEDGER[0]!.code);

  return (
    <div className="border-t border-[#DDD5C7]">
      {LEDGER.map((entry) => {
        const isExpanded = expandedCode === entry.code;
        return (
          <div key={entry.code} className="border-b border-[#DDD5C7]">
            <button
              type="button"
              onClick={() => setExpandedCode(isExpanded ? null : entry.code)}
              aria-expanded={isExpanded}
              className="group grid w-full grid-cols-[auto_1fr_auto] items-center gap-4 py-5 text-left transition-colors hover:bg-[#EDE7DC]/60 sm:grid-cols-[5rem_1fr_16rem_auto] sm:gap-6 sm:px-2"
            >
              <span className="font-mono text-xs font-semibold tracking-wider text-[#BA5D2C]">
                {entry.code} / {entry.specCode}
              </span>

              <span className="flex min-w-0 items-center gap-3">
                <entry.icon className="hidden h-4 w-4 shrink-0 text-[#7A6E65] sm:block" />
                <span className="min-w-0">
                  <span className="block truncate font-sans text-base font-semibold tracking-tight text-[#1D1714]">
                    {entry.category}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-[#7A6E65] sm:hidden">{entry.metros}</span>
                </span>
              </span>

              <span className="hidden truncate text-xs text-[#7A6E65] sm:block">{entry.deliverables}</span>

              <ChevronDown
                className={`h-4 w-4 shrink-0 text-[#7A6E65] transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
              />
            </button>

            {isExpanded && (
              <div className="grid grid-cols-2 gap-5 bg-[#EDE7DC]/60 px-1 pb-6 pt-1 sm:grid-cols-4 sm:px-2">
                <p className="col-span-2 text-xs text-[#7A6E65] sm:hidden">{entry.deliverables}</p>
                {entry.snapshot.map(([label, value]) => (
                  <div key={label}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[#7A6E65]">{label}</p>
                    <p className="mt-1 text-sm font-semibold text-[#1D1714]">{value}</p>
                  </div>
                ))}
                <p className="col-span-2 text-[10px] font-semibold uppercase tracking-wider text-[#7A6E65] sm:col-span-4">
                  Metro Coverage — {entry.metros}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
