export function GovernanceFooter() {
  return (
    <footer className="mt-10 border-t border-zinc-200 px-4 py-6 text-center text-[11px] text-zinc-500">
      <p>
        PulseGrid indexes publicly broadcast commercial media and entertainment portfolios for agency intelligence and
        talent discovery.
      </p>
      <div className="mt-2 flex items-center justify-center gap-3">
        <a href="/privacy" className="hover:text-zinc-900">
          Privacy Policy
        </a>
        <span aria-hidden="true">·</span>
        <a href="/terms" className="hover:text-zinc-900">
          Terms of Service
        </a>
        <span aria-hidden="true">·</span>
        <a href="/opt-out" className="hover:text-zinc-900">
          Creator Opt-Out / Claim Profile
        </a>
      </div>
    </footer>
  );
}
