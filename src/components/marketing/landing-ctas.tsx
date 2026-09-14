'use client';

import { useState } from 'react';

import { AgencyPassModal } from '@/components/growth/agency-pass-modal';

export interface LandingCtasProps {
  size?: 'sm' | 'md' | 'lg';
  /** This same component renders on both the cream hero/nav and the dark-pine closing CTA — `onDark` inverts the fill so the primary pill never blends into its own background. */
  onDark?: boolean;
}

/**
 * "Inquire for Talent" (primary, opens AgencyPassModal — the same
 * lead-capture flow /discover uses) + "Explore Roster" (secondary ghost,
 * -> /login, the actual gateway to browsing the directory). One client
 * component so the marketing page itself can stay a server component.
 */
export function LandingCtas({ size = 'md', onDark = false }: LandingCtasProps) {
  const [modalOpen, setModalOpen] = useState(false);

  const sizeClasses = {
    sm: 'px-3.5 py-1.5 text-xs',
    md: 'px-5 py-2.5 text-sm',
    lg: 'px-6 py-3.5 text-base',
  }[size];

  const primaryClasses = onDark
    ? 'bg-white text-[#132A24] hover:bg-emerald-50'
    : 'bg-[#132A24] text-white hover:bg-[#0E201B]';
  const ghostClasses = onDark
    ? 'border-white/25 text-white hover:border-white/50 hover:bg-white/5'
    : 'border-[#18231E]/20 text-[#18231E] hover:border-[#18231E]/40 hover:bg-[#18231E]/5';

  return (
    <>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className={`rounded-full font-semibold shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 ${sizeClasses} ${primaryClasses}`}
        >
          Inquire for Talent
        </button>
        <a
          href="/login"
          className={`rounded-full border font-semibold transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 ${sizeClasses} ${ghostClasses}`}
        >
          Explore Roster
        </a>
      </div>
      <AgencyPassModal open={modalOpen} onOpenChange={setModalOpen} trigger="manual" />
    </>
  );
}
