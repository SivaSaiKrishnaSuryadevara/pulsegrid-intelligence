'use client';

import { useState } from 'react';

import { BookingBriefModal } from '@/components/booking-brief-modal';

export interface LandingCtasProps {
  size?: 'sm' | 'md' | 'lg';
  /** Hero renders these left-aligned inside its own flex row; every other call site centers them. */
  align?: 'center' | 'start';
}

/**
 * "Access Talent Desk" (primary, solid raw-umber fill — opens
 * BookingBriefModal in generic/unassigned-creator mode, the zero-friction
 * private-beta intake) + "Review Roster" (secondary stone-bordered ghost,
 * -> /discover directly — no login wall since /discover became publicly
 * browsable, see migration 016). One client component so the marketing
 * page itself can stay a server component. The primary button was
 * AgencyPassModal (a pricing-tier/lead-capture flow) before the
 * private-beta pivot — that modal is still used elsewhere (the /discover
 * credits paywall), just no longer the landing page's own primary CTA.
 */
export function LandingCtas({ size = 'md', align = 'center' }: LandingCtasProps) {
  const [modalOpen, setModalOpen] = useState(false);

  const sizeClasses = {
    sm: 'px-3.5 py-1.5 text-xs',
    md: 'px-5 py-2.5 text-sm',
    lg: 'px-6 py-3.5 text-base',
  }[size];

  return (
    <>
      <div className={`flex flex-wrap items-center gap-3 ${align === 'center' ? 'justify-center' : 'justify-start'}`}>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className={`rounded-full bg-[#1D1714] font-semibold text-[#F7F4EE] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#322822] active:translate-y-0 ${sizeClasses}`}
        >
          Access Talent Desk
        </button>
        <a
          href="/discover"
          className={`rounded-full border border-[#DDD5C7] font-semibold text-[#1D1714] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#BA5D2C]/50 hover:text-[#BA5D2C] active:translate-y-0 ${sizeClasses}`}
        >
          Review Roster
        </a>
      </div>
      <BookingBriefModal open={modalOpen} onOpenChange={setModalOpen} />
    </>
  );
}
