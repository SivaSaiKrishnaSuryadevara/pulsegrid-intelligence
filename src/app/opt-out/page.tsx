'use client';

import { CheckCircle2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';

type SubmitState = 'idle' | 'submitting' | 'submitted' | 'error';

export default function OptOutPage() {
  const [handle, setHandle] = useState('');
  const [email, setEmail] = useState('');
  const [state, setState] = useState<SubmitState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setState('submitting');
    setErrorMessage(null);
    try {
      const response = await fetch('/api/opt-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle, email }),
      });
      const payload = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? 'Request failed.');
      }
      setState('submitted');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setState('error');
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <h1 className="text-xl font-bold text-zinc-900">Creator Opt-Out / Claim Profile</h1>
      <p className="mt-2 text-sm text-zinc-600">
        PulseGrid indexes publicly broadcast commercial media and entertainment portfolios for agency intelligence and
        talent discovery. If you&apos;d like your profile delisted, submit your handle and email below — our team
        reviews and actions every request within 24 hours.
      </p>

      {state === 'submitted' ? (
        <div className="mt-6 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          Request received — we&apos;ll follow up at {email} within 24 hours.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          <label className="block space-y-1 text-xs text-zinc-600">
            Instagram handle
            <input
              type="text"
              required
              value={handle}
              onChange={(event) => setHandle(event.target.value)}
              placeholder="@yourhandle"
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none"
            />
          </label>
          <label className="block space-y-1 text-xs text-zinc-600">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none"
            />
          </label>
          {state === 'error' && errorMessage && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700">{errorMessage}</p>
          )}
          <button
            type="submit"
            disabled={state === 'submitting'}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {state === 'submitting' ? 'Submitting…' : 'Request Delisting'}
          </button>
        </form>
      )}
    </main>
  );
}
