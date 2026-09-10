'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Check, Send, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { getBrowserSupabaseClient } from '@/lib/supabase/client';
import type { CreatorCardModel } from '@/types/creator';

export interface ConciergeRequestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creator: CreatorCardModel;
}

type SubmitState = 'idle' | 'submitting' | 'submitted' | 'error';

/**
 * The Talent Desk tab's "Request Introduction & Availability" CTA — the
 * concierge hand-off for a creator whose direct email/phone aren't on
 * file. Submits a booking inquiry to PulseGrid's own production desk
 * (POST /api/concierge/request -> `concierge_requests`, migration 009)
 * rather than trying to email the creator directly, which wouldn't make
 * sense here since there's no address to send to.
 */
export function ConciergeRequestModal({ open, onOpenChange, creator }: ConciergeRequestModalProps) {
  const [requesterEmail, setRequesterEmail] = useState('');
  const [requesterPhone, setRequesterPhone] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [venue, setVenue] = useState('');
  const [budget, setBudget] = useState('');
  const [riderNotes, setRiderNotes] = useState('');
  const [submitState, setSubmitState] = useState<SubmitState>('idle');

  // Prefill the requester's email from their session the first time the
  // modal opens for this creator — convenience only, still editable.
  useEffect(() => {
    if (!open || requesterEmail) return;
    getBrowserSupabaseClient()
      .auth.getUser()
      .then(({ data }) => {
        if (data.user?.email) setRequesterEmail(data.user.email);
      })
      .catch(() => {
        // Non-fatal — the field just stays blank for the agency to fill in.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Reset the transient form/submit state each time this is reopened for a
  // (possibly different) creator, so a prior submission's confirmation
  // doesn't linger onto the next one.
  useEffect(() => {
    if (open) setSubmitState('idle');
  }, [open, creator.id]);

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!requesterEmail.trim()) return;
    setSubmitState('submitting');
    try {
      const response = await fetch('/api/concierge/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creatorId: creator.id,
          creatorHandle: creator.handle,
          creatorDisplayName: creator.displayName,
          requesterEmail: requesterEmail.trim(),
          requesterPhone: requesterPhone.trim() || undefined,
          eventDate: eventDate.trim() || undefined,
          venue: venue.trim() || undefined,
          budget: budget.trim() || undefined,
          riderNotes: riderNotes.trim() || undefined,
        }),
      });
      if (!response.ok) throw new Error('Request failed');
      setSubmitState('submitted');
    } catch {
      setSubmitState('error');
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-zinc-900/40 transition-opacity ease-out data-[state=closed]:opacity-0 data-[state=open]:opacity-100" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[70] w-[92%] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-zinc-200/90 bg-white p-6 shadow-2xl transition-all duration-300 ease-out data-[state=closed]:scale-95 data-[state=closed]:opacity-0 data-[state=open]:scale-100 data-[state=open]:opacity-100">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-lg font-bold text-zinc-900">Request Introduction &amp; Availability</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-zinc-600">
                For {creator.displayName} (@{creator.handle}) — routed to PulseGrid&apos;s production desk.
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

          {submitState === 'submitted' ? (
            <p className="mt-6 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              <Check className="h-4 w-4 shrink-0" />
              Sent — our production desk will coordinate availability, fees, and deliverables within 24 hours.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="mt-5 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1 text-xs text-zinc-600">
                  Your email
                  <input
                    type="email"
                    required
                    value={requesterEmail}
                    onChange={(e) => setRequesterEmail(e.target.value)}
                    placeholder="you@agency.com"
                    className="w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none"
                  />
                </label>
                <label className="space-y-1 text-xs text-zinc-600">
                  Your phone (optional)
                  <input
                    type="tel"
                    value={requesterPhone}
                    onChange={(e) => setRequesterPhone(e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    className="w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none"
                  />
                </label>
                <label className="space-y-1 text-xs text-zinc-600">
                  Event date
                  <input
                    type="text"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    placeholder="e.g. March 15, 2027"
                    className="w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none"
                  />
                </label>
                <label className="space-y-1 text-xs text-zinc-600">
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
                <label className="col-span-2 space-y-1 text-xs text-zinc-600">
                  Talent rider / booking notes (optional)
                  <textarea
                    value={riderNotes}
                    onChange={(e) => setRiderNotes(e.target.value)}
                    placeholder="Deliverables, AV needs, set length, anything the desk should know up front"
                    rows={3}
                    className="w-full resize-none rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none"
                  />
                </label>
              </div>

              {submitState === 'error' && (
                <p className="text-xs text-rose-600">Something went wrong — please try again.</p>
              )}

              <button
                type="submit"
                disabled={submitState === 'submitting'}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                {submitState === 'submitting' ? 'Sending…' : 'Send to Production Desk'}
              </button>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
