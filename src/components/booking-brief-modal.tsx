'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Check, MapPin, Send, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Avatar } from '@/components/pseo/avatar';
import { BUDGET_RANGE_OPTIONS, DIALECT_OPTIONS, TALENT_CATEGORY_OPTIONS } from '@/lib/booking-briefs/constants';
import { PRIMARY_METRO_FILTER_OPTIONS } from '@/lib/discover/constants';
import type { MetroHub } from '@/types/creator';

export interface BookingBriefTargetCreator {
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  metro: MetroHub;
  specialty: string;
}

export interface BookingBriefModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Omit or pass null for the generic (unassigned-creator) intake flow — metro becomes a free choice instead of locked to one creator's hub. */
  creator?: BookingBriefTargetCreator | null;
}

type SubmitState = 'idle' | 'submitting' | 'submitted' | 'error';

const INPUT_CLASS =
  'w-full rounded-lg border border-[#DDD5C7] bg-[#F7F4EE] px-2.5 py-2 text-sm text-[#1D1714] placeholder:text-[#7A6E65]/70 focus:border-[#BA5D2C] focus:outline-none';

/**
 * Zero-friction event intake for the private beta — POSTs to /api/briefs
 * (booking_briefs table). No auth required, deliberately: this is the
 * top-of-funnel path a planner reaches before ever creating an agency
 * account, distinct from ConciergeRequestModal (an already-authenticated
 * agency's per-creator "unlock desk" follow-up).
 */
export function BookingBriefModal({ open, onOpenChange, creator }: BookingBriefModalProps) {
  const [plannerName, setPlannerName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [metro, setMetro] = useState<MetroHub | ''>(creator?.metro ?? '');
  const [venue, setVenue] = useState('');
  const [talentCategory, setTalentCategory] = useState('');
  const [dialects, setDialects] = useState<string[]>([]);
  const [budgetRange, setBudgetRange] = useState('');
  const [notes, setNotes] = useState('');
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Reset the transient state each time the modal is (re)opened, and lock
  // metro to the target creator's hub when opened from a dossier.
  useEffect(() => {
    if (!open) return;
    setSubmitState('idle');
    setSubmitError(null);
    setMetro(creator?.metro ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, creator?.handle]);

  function toggleDialect(dialect: string): void {
    setDialects((prev) => (prev.includes(dialect) ? prev.filter((d) => d !== dialect) : [...prev, dialect]));
  }

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!plannerName.trim() || !contactEmail.trim() || !eventDate || !metro || !talentCategory) return;
    setSubmitState('submitting');
    setSubmitError(null);
    try {
      const response = await fetch('/api/briefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plannerName: plannerName.trim(),
          contactEmail: contactEmail.trim(),
          contactPhone: contactPhone.trim() || undefined,
          eventDate,
          metro,
          venue: venue.trim() || undefined,
          talentCategory,
          dialects: dialects.length > 0 ? dialects : undefined,
          budgetRange: budgetRange || undefined,
          notes: notes.trim() || undefined,
          targetCreatorHandle: creator?.handle,
        }),
      });
      if (!response.ok) {
        const errorBody = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(errorBody?.message ?? `Submission failed (${response.status})`);
      }
      setSubmitState('submitted');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
      setSubmitState('error');
    }
  }

  const metroLabel = PRIMARY_METRO_FILTER_OPTIONS.find((m) => m.metro === metro)?.label;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-[#1D1714]/60 backdrop-blur-sm transition-opacity ease-out data-[state=closed]:opacity-0 data-[state=open]:opacity-100" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[70] max-h-[90vh] w-[92%] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-[#DDD5C7] bg-[#EDE7DC] p-6 shadow-2xl transition-all duration-300 ease-out data-[state=closed]:scale-95 data-[state=closed]:opacity-0 data-[state=open]:scale-100 data-[state=open]:opacity-100">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="font-sans text-lg font-semibold tracking-tight text-[#1D1714]">
                Submit Event Brief
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-[#7A6E65]">
                Complimentary during our private beta — no account required.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="shrink-0 rounded-full p-1.5 text-[#7A6E65] transition-all hover:bg-[#F7F4EE] hover:text-[#1D1714]"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          {submitState === 'submitted' ? (
            <div className="mt-6 rounded-xl border border-[#BA5D2C]/30 bg-[#BA5D2C]/10 p-5 text-center">
              <Check className="mx-auto h-6 w-6 text-[#BA5D2C]" />
              <p className="mt-3 font-sans text-sm font-semibold tracking-tight text-[#1D1714]">Brief Received.</p>
              <p className="mt-1.5 text-sm leading-relaxed text-[#7A6E65]">
                Our talent desk is checking verified holds and rider availability for {metroLabel ?? 'your metro'}. We
                will follow up within 24 hours.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              {creator && (
                <div className="flex items-center gap-3 rounded-xl border border-[#DDD5C7] bg-[#F7F4EE] p-3">
                  <Avatar name={creator.displayName} url={creator.avatarUrl} size={40} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#1D1714]">{creator.displayName}</p>
                    <p className="truncate text-xs text-[#7A6E65]">
                      @{creator.handle} · {creator.specialty}
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Field label="Event date">
                  <input
                    type="date"
                    required
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    className={INPUT_CLASS}
                  />
                </Field>
                <Field label="Metro">
                  {creator ? (
                    <div className={`${INPUT_CLASS} flex items-center gap-1.5 text-[#7A6E65]`}>
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{metroLabel}</span>
                    </div>
                  ) : (
                    <select
                      required
                      value={metro}
                      onChange={(e) => setMetro(e.target.value as MetroHub)}
                      className={INPUT_CLASS}
                    >
                      <option value="" disabled>
                        Select metro…
                      </option>
                      {PRIMARY_METRO_FILTER_OPTIONS.map((m) => (
                        <option key={m.metro} value={m.metro}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
              </div>

              <Field label="Talent category">
                <select
                  required
                  value={talentCategory}
                  onChange={(e) => setTalentCategory(e.target.value)}
                  className={INPUT_CLASS}
                >
                  <option value="" disabled>
                    Select category…
                  </option>
                  {TALENT_CATEGORY_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Cultural dialects / traditions (optional)">
                <div className="flex flex-wrap gap-1.5">
                  {DIALECT_OPTIONS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleDialect(d)}
                      aria-pressed={dialects.includes(d)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                        dialects.includes(d)
                          ? 'border-[#BA5D2C]/40 bg-[#BA5D2C]/10 text-[#BA5D2C]'
                          : 'border-[#DDD5C7] bg-[#F7F4EE] text-[#7A6E65] hover:border-[#BA5D2C]/30'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Estimated entertainment budget (optional)">
                <div className="flex flex-wrap gap-1.5">
                  {BUDGET_RANGE_OPTIONS.map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setBudgetRange(budgetRange === b ? '' : b)}
                      aria-pressed={budgetRange === b}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                        budgetRange === b
                          ? 'border-[#BA5D2C]/40 bg-[#BA5D2C]/10 text-[#BA5D2C]'
                          : 'border-[#DDD5C7] bg-[#F7F4EE] text-[#7A6E65] hover:border-[#BA5D2C]/30'
                      }`}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Your name">
                  <input
                    type="text"
                    required
                    value={plannerName}
                    onChange={(e) => setPlannerName(e.target.value)}
                    placeholder="Jane Smith"
                    className={INPUT_CLASS}
                  />
                </Field>
                <Field label="Email">
                  <input
                    type="email"
                    required
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="you@agency.com"
                    className={INPUT_CLASS}
                  />
                </Field>
                <Field label="Phone (optional)">
                  <input
                    type="tel"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    className={INPUT_CLASS}
                  />
                </Field>
                <Field label="Venue (optional)">
                  <input
                    type="text"
                    value={venue}
                    onChange={(e) => setVenue(e.target.value)}
                    placeholder="The Grand Ballroom, Dallas"
                    className={INPUT_CLASS}
                  />
                </Field>
              </div>

              <Field label="Notes (optional)">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Timing requirements, sound gear notes, anything the desk should know"
                  className={`${INPUT_CLASS} resize-none`}
                />
              </Field>

              {submitState === 'error' && submitError && <p className="text-xs text-rose-700">{submitError}</p>}

              <button
                type="submit"
                disabled={submitState === 'submitting'}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1D1714] px-4 py-3 text-sm font-semibold text-[#F7F4EE] shadow-sm transition-all hover:bg-[#322822] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                {submitState === 'submitting' ? 'Submitting…' : 'Submit Event Brief (Complimentary Beta)'}
              </button>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1 text-xs font-medium text-[#7A6E65]">
      {label}
      {children}
    </label>
  );
}
