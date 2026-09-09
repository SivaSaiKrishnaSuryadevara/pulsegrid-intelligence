'use client';

import { useState } from 'react';

import { AgencyPassModal } from '@/components/growth/agency-pass-modal';

/** Shared "Sign In" + "Request Agency Pass" button pair, wired to the same AgencyPassModal used inside /discover. Lives in one client component so the marketing page itself can stay a server component. */
export function LandingCtas({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const [modalOpen, setModalOpen] = useState(false);

  const sizeClasses = {
    sm: 'px-3.5 py-1.5 text-xs',
    md: 'px-5 py-2.5 text-sm',
    lg: 'px-6 py-3.5 text-base',
  }[size];

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <a
          href="/login"
          className={`rounded-xl bg-zinc-900 font-semibold text-white shadow-sm transition-all hover:bg-zinc-800 ${sizeClasses}`}
        >
          Sign In
        </a>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className={`rounded-xl border border-zinc-300 bg-white font-semibold text-zinc-900 transition-all hover:border-zinc-400 ${sizeClasses}`}
        >
          Request Agency Pass
        </button>
      </div>
      <AgencyPassModal open={modalOpen} onOpenChange={setModalOpen} trigger="manual" />
    </>
  );
}
