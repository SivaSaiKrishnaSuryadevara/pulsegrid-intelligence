'use client';

import { Mic2, Music2, PartyPopper, Sparkles, Users, type LucideIcon } from 'lucide-react';
import { useState } from 'react';

interface CategorySpotlight {
  key: string;
  icon: LucideIcon;
  title: string;
  tagline: string;
  /** Illustrative example fields, using the real entityDetails vocabulary (set length, genre tags, venue scale, ...) each category actually models — not fabricated as a real creator's data, same convention as the Full Dossier section's "Illustrative example" label. */
  fields: [string, string][];
}

const CATEGORIES: CategorySpotlight[] = [
  {
    key: 'dj',
    icon: Music2,
    title: 'DJ & Sound',
    tagline: 'Genre-matched to Bollywood, Bhangra, Garba, and Tollywood sets.',
    fields: [
      ['Set Length', '90–120 min'],
      ['Sound Rig', 'Full PA + 2 wireless mics'],
      ['Genre Tags', 'Bollywood, Bhangra, Garba'],
      ['Max Capacity', '300 guests'],
    ],
  },
  {
    key: 'dance',
    icon: Sparkles,
    title: 'Dance Troupe',
    tagline: 'Troupe size and style, so you know who can actually fill your stage.',
    fields: [
      ['Troupe Size', '8–12 dancers'],
      ['Style', 'Bollywood Fusion'],
      ['Stage Rider', 'Sprung floor preferred'],
      ['Booking Window', '6–8 weeks notice'],
    ],
  },
  {
    key: 'emcee',
    icon: Mic2,
    title: 'Stage Emcee',
    tagline: 'Bilingual hosts who can carry a full program, baraat to reception.',
    fields: [
      ['Dialect Tags', 'Hindi, Telugu, English'],
      ['Program Coverage', 'Full-day'],
      ['Desk Status', 'Self-Represented'],
      ['Typical Response', '< 24 hrs'],
    ],
  },
  {
    key: 'planner',
    icon: PartyPopper,
    title: 'Event Planner',
    tagline: 'Venue scale and permit rating, not just a pretty Instagram grid.',
    fields: [
      ['Venue Scale', 'Mid-Scale 500–2,000'],
      ['Permit Rating', '92%'],
      ['Portfolio', '40+ weddings produced'],
      ['Lead Time', '3–6 months'],
    ],
  },
  {
    key: 'creator',
    icon: Users,
    title: 'Content Creator',
    tagline: 'Real reach and engagement, computed from their own posts.',
    fields: [
      ['Avg. Reach', '12.4K'],
      ['Engagement', '6.2%'],
      ['Niche', 'Cultural Events'],
      ['Est. Rate', '$300–$900'],
    ],
  },
];

/**
 * Left column: category list with an active indicator. Right column: a
 * spotlight card for whichever category is active, showing illustrative
 * real-field metadata — replaces a uniform 5-card grid with a single
 * focused reveal, matching the "not a boxy card wall" brief. Client
 * component (needs interaction state) embedded in the still-server-
 * rendered landing page, same pattern as LandingCtas/RevealOnScroll.
 */
export function CategoryShowcase() {
  const [activeKey, setActiveKey] = useState<string>(CATEGORIES[0]!.key);
  const active = CATEGORIES.find((c) => c.key === activeKey) ?? CATEGORIES[0]!;

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-8">
      <div className="flex flex-col gap-1">
        {CATEGORIES.map((category) => {
          const isActive = category.key === activeKey;
          return (
            <button
              key={category.key}
              type="button"
              onClick={() => setActiveKey(category.key)}
              className={`group flex items-center gap-4 rounded-xl border-l-2 px-4 py-4 text-left transition-all duration-200 ${
                isActive ? 'border-[#E5C378] bg-[#131917]' : 'border-transparent hover:border-[#1F2B26] hover:bg-[#131917]/50'
              }`}
            >
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                  isActive ? 'border-[#E5C378]/40 bg-[#E5C378]/10 text-[#E5C378]' : 'border-[#1F2B26] text-stone-400'
                }`}
              >
                <category.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className={`text-sm font-bold ${isActive ? 'text-white' : 'text-stone-300'}`}>{category.title}</p>
                <p className="mt-0.5 truncate text-xs text-stone-500">{category.tagline}</p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl border border-[#1F2B26] bg-[#131917] p-8">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-500">Illustrative example</p>
        <div className="mt-3 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#E5C378]/30 bg-[#E5C378]/10 text-[#E5C378]">
            <active.icon className="h-6 w-6" />
          </div>
          <div>
            <h3 className="font-serif text-2xl font-medium text-white">{active.title}</h3>
            <p className="text-sm text-stone-400">{active.tagline}</p>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-6 border-t border-[#1F2B26] pt-6">
          {active.fields.map(([label, value]) => (
            <div key={label}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">{label}</p>
              <p className="mt-1 text-sm font-semibold text-stone-100">{value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
