'use client';

import { Check, Copy, Mail } from 'lucide-react';
import { useMemo, useState } from 'react';

import { ENTITY_TYPE_DISPLAY_LABELS, NICHE_DISPLAY_LABELS } from '@/lib/discover/constants';
import { formatRateRange } from '@/lib/format';
import { METRO_LABELS } from '@/lib/pseo/directory-config';
import type { CreatorCardModel } from '@/types/creator';

export interface OutreachBriefFormProps {
  creator: CreatorCardModel;
  /** The unlocked booking email, if the Talent Desk has been revealed — used for the mailto: link only. */
  contactEmail: string | null;
}

/**
 * Deterministic template, not another LLM call — this only fills in a
 * fixed pitch-email shape from the form inputs and data already on the
 * card. Keeps 1-click generation instant and free; an AI-drafted version
 * is a reasonable follow-up if the templated copy proves too generic.
 */
function buildBriefText(creator: CreatorCardModel, eventDate: string, venue: string, budget: string): string {
  const metroLabel = METRO_LABELS[creator.primaryMetro].label;
  const nicheLabel = NICHE_DISPLAY_LABELS[creator.primaryNiche];
  const entityLabel = ENTITY_TYPE_DISPLAY_LABELS[creator.entityType];
  const rateLabel = formatRateRange(creator.estMinimumRateUsd, creator.estMaximumRateUsd);

  const lines = [
    `Subject: Booking Inquiry — ${eventDate || '[Event Date]'} at ${venue || '[Venue]'}`,
    '',
    `Hi ${creator.displayName.split(' ')[0] || creator.displayName},`,
    '',
    `We're reaching out on behalf of our client for an upcoming event${venue ? ` at ${venue}` : ''}${
      eventDate ? ` on ${eventDate}` : ''
    }. We came across your profile (@${creator.handle}) and think you'd be a fantastic fit as our ${entityLabel.toLowerCase()} for this ${nicheLabel.toLowerCase()} program in the ${metroLabel} area.`,
    '',
    `Proposed budget: ${budget || rateLabel}`,
    '',
    "Could you share your availability and confirm interest? Happy to send over the full event brief once we hear back.",
    '',
    'Best,',
    '[Your Name] · [Your Agency]',
  ];

  return lines.join('\n');
}

export function OutreachBriefForm({ creator, contactEmail }: OutreachBriefFormProps) {
  const [eventDate, setEventDate] = useState('');
  const [venue, setVenue] = useState('');
  const [budget, setBudget] = useState('');
  const [copied, setCopied] = useState(false);

  const briefText = useMemo(
    () => buildBriefText(creator, eventDate, venue, budget),
    [creator, eventDate, venue, budget]
  );

  const mailtoHref = useMemo(() => {
    const [subjectLine, ...rest] = briefText.split('\n');
    const subject = (subjectLine ?? '').replace(/^Subject:\s*/, '');
    const body = rest.join('\n').trimStart();
    const params = new URLSearchParams({ subject, body });
    return `mailto:${contactEmail ?? ''}?${params.toString()}`;
  }, [briefText, contactEmail]);

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(briefText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable — button simply won't show the confirmation.
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="col-span-2 space-y-1 text-xs text-zinc-600">
          Event date
          <input
            type="text"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            placeholder="e.g. March 15, 2027"
            className="w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none"
          />
        </label>
        <label className="col-span-2 space-y-1 text-xs text-zinc-600">
          Venue
          <input
            type="text"
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
            placeholder="e.g. The Grand Ballroom, Dallas"
            className="w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none"
          />
        </label>
        <label className="col-span-2 space-y-1 text-xs text-zinc-600">
          Proposed budget
          <input
            type="text"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            placeholder="e.g. $2,000 – $3,500"
            className="w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none"
          />
        </label>
      </div>

      <pre className="whitespace-pre-wrap rounded-xl border border-zinc-200 bg-zinc-50 p-3 font-mono text-[11px] leading-relaxed text-zinc-700">
        {briefText}
      </pre>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleCopy}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-700 transition-all hover:border-zinc-400 hover:text-zinc-900"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy Brief'}
        </button>
        <a
          href={mailtoHref}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-zinc-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-zinc-800"
        >
          <Mail className="h-3.5 w-3.5" />
          Open in Email
        </a>
      </div>
      {!contactEmail && (
        <p className="text-[11px] text-zinc-500">Unlock the Talent Desk to pre-fill the recipient address.</p>
      )}
    </div>
  );
}
