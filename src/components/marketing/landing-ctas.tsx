'use client';

import { useState } from 'react';

import { AgencyPassModal } from '@/components/growth/agency-pass-modal';

export interface LandingCtasProps {
  size?: 'sm' | 'md' | 'lg';
  /** Hero renders these left-aligned inside its own flex row; every other call site centers them. */
  align?: 'center' | 'start';
}

/**
 * "Access Talent Desk" (primary, solid raw-umber fill — opens
 * AgencyPassModal, the same lead-capture flow /discover uses) + "Review
 * Roster" (secondary stone-bordered ghost, -> /login, the actual gateway
 * to browsing the directory). One client component so the marketing page
 * itself can stay a server component.
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
          href="/login"
          className={`rounded-full border border-[#DDD5C7] font-semibold text-[#1D1714] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#BA5D2C]/50 hover:text-[#BA5D2C] active:translate-y-0 ${sizeClasses}`}
        >
          Review Roster
        </a>
      </div>
      <AgencyPassModal open={modalOpen} onOpenChange={setModalOpen} trigger="manual" />
    </>
  );
}
