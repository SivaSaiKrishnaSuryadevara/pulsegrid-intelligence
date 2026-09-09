'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Check, Mail, PhoneCall, X } from 'lucide-react';
import { useState } from 'react';

/**
 * Lead-capture only — no payment processor is integrated this pass (no
 * Stripe/billing dependency exists in this project). The tier cards are
 * informational; the two real conversion actions are a concierge-call
 * mailto: link and an email-capture form that queues a `growth_leads` row
 * for manual sales follow-up via `POST /api/growth/lead-capture`.
 */
export interface AgencyPassModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What triggered the paywall — informs the headline copy only. */
  trigger: 'insufficient_credits' | 'export_blocked' | 'manual';
}

const TRIGGER_HEADLINES: Record<AgencyPassModalProps['trigger'], string> = {
  insufficient_credits: "You're out of desk-unlock credits",
  export_blocked: 'Unlock complete rosters to export',
  manual: 'Unlock Complete Event Production Intelligence & Direct Desks',
};

type LeadState = 'idle' | 'submitting' | 'submitted' | 'error';

export function AgencyPassModal({ open, onOpenChange, trigger }: AgencyPassModalProps) {
  const [workEmail, setWorkEmail] = useState('');
  const [tierInterest, setTierInterest] = useState<'campaign_pass' | 'agency_pro'>('agency_pro');
  const [leadState, setLeadState] = useState<LeadState>('idle');

  async function handleSubmitLead(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!workEmail.trim()) return;
    setLeadState('submitting');
    try {
      const response = await fetch('/api/growth/lead-capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workEmail: workEmail.trim(), tierInterest }),
      });
      if (!response.ok) throw new Error('Request failed');
      setLeadState('submitted');
    } catch {
      setLeadState('error');
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-zinc-900/40 transition-opacity ease-out data-[state=closed]:opacity-0 data-[state=open]:opacity-100" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[92%] max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-zinc-200/90 bg-white p-6 shadow-2xl transition-all duration-300 ease-out data-[state=closed]:scale-95 data-[state=closed]:opacity-0 data-[state=open]:scale-100 data-[state=open]:opacity-100">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-lg font-bold text-zinc-900">{TRIGGER_HEADLINES[trigger]}</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-zinc-600">
                Unlock complete event production intelligence &amp; direct desks.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="shrink-0 rounded-full p-1.5 text-zinc-500 transition-all hover:bg-zinc-100 hover:text-zinc-900"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TierCard
              name="Campaign Pass"
              price="$149"
              cadence="one-time"
              features={[
                '10 Full Dossier Unlocks',
                'White-Label Event Roster PDF Export',
                '60-Day Exclusivity Audit',
              ]}
              selected={tierInterest === 'campaign_pass'}
              onSelect={() => setTierInterest('campaign_pass')}
            />
            <TierCard
              name="Agency Pro"
              price="$499"
              cadence="/ year"
              features={[
                'Unlimited Metro & Dialect Search',
                'Cross-Entity Production Roster Builder',
                'Priority Vetted Talent Desk',
              ]}
              selected={tierInterest === 'agency_pro'}
              onSelect={() => setTierInterest('agency_pro')}
              highlighted
            />
          </div>

          <div className="mt-6 space-y-3 border-t border-zinc-200 pt-5">
            <a
              href="mailto:sales@pulsegrid.io?subject=10-Minute%20Concierge%20Lineup%20Call"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-zinc-800"
            >
              <PhoneCall className="h-4 w-4" />
              Book a 10-Minute Concierge Lineup Call with our Intelligence Team
            </a>

            {leadState === 'submitted' ? (
              <p className="flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                <Check className="h-4 w-4" />
                Thanks — our team will reach out shortly.
              </p>
            ) : (
              <form onSubmit={handleSubmitLead} className="flex gap-2">
                <div className="relative flex-1">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="email"
                    required
                    value={workEmail}
                    onChange={(event) => setWorkEmail(event.target.value)}
                    placeholder="Work email"
                    className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-9 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={leadState === 'submitting'}
                  className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-700 transition-all hover:border-emerald-500 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {leadState === 'submitting' ? 'Sending…' : 'Notify Me'}
                </button>
              </form>
            )}
            {leadState === 'error' && <p className="text-xs text-rose-600">Something went wrong — please try again.</p>}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function TierCard({
  name,
  price,
  cadence,
  features,
  selected,
  onSelect,
  highlighted = false,
}: {
  name: string;
  price: string;
  cadence: string;
  features: string[];
  selected: boolean;
  onSelect: () => void;
  highlighted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex flex-col items-start gap-3 rounded-2xl border p-4 text-left transition-all ${
        selected
          ? 'border-emerald-300 bg-emerald-50 ring-1 ring-emerald-200'
          : 'border-zinc-200 bg-white hover:border-zinc-300'
      }`}
    >
      <div className="flex items-center gap-2">
        <p className="text-sm font-bold text-zinc-900">{name}</p>
        {highlighted && (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
            Popular
          </span>
        )}
      </div>
      <p className="font-mono text-2xl font-semibold tracking-tight text-zinc-900">
        {price} <span className="text-sm font-normal text-zinc-500">{cadence}</span>
      </p>
      <ul className="space-y-1.5">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-1.5 text-xs text-zinc-700">
            <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
            {feature}
          </li>
        ))}
      </ul>
    </button>
  );
}
