'use client';

import { useState } from 'react';

import { AgencyPassModal } from '@/components/growth/agency-pass-modal';

export interface LandingCtasProps {
  size?: 'sm' | 'md' | 'lg';
}

/**
 * "Inquire for Talent" (primary, champagne-gold fill — opens
 * AgencyPassModal, the same lead-capture flow /discover uses) +
 * "Explore Roster" (secondary ghost, -> /login, the actual gateway to
 * browsing the directory). One client component so the marketing page
 * itself can stay a server component. The whole page is now one
 * consistent obsidian canvas, so unlike the previous cream/dark-pine
 * split this needs no light/dark variant.
 */
export function LandingCtas({ size = 'md' }: LandingCtasProps) {
  const [modalOpen, setModalOpen] = useState(false);

  const sizeClasses = {
    sm: 'px-3.5 py-1.5 text-xs',
    md: 'px-5 py-2.5 text-sm',
    lg: 'px-6 py-3.5 text-base',
  }[size];

  return (
    <>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className={`rounded-full bg-[#E5C378] font-semibold text-[#0B0F0E] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#EFD498] hover:shadow-md active:translate-y-0 ${sizeClasses}`}
        >
          Inquire for Talent
        </button>
        <a
          href="/login"
          className={`rounded-full border border-stone-600/50 font-semibold text-stone-300 transition-all duration-200 hover:-translate-y-0.5 hover:border-stone-400 hover:text-white active:translate-y-0 ${sizeClasses}`}
        >
          Explore Roster
        </a>
      </div>
      <AgencyPassModal open={modalOpen} onOpenChange={setModalOpen} trigger="manual" />
    </>
  );
}
