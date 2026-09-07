'use client';

import { LogIn, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { getBrowserSupabaseClient } from '@/lib/supabase/client';

// Next.js statically replaces process.env.NODE_ENV at build time (including
// in Client Components), so this branch — and the button below it — is
// dead-code-eliminated from production bundles automatically.
const isDevelopment = process.env.NODE_ENV === 'development';

// Matches src/scripts/create-test-user.ts. Dev-only convenience credentials
// for a throwaway local account — never a real login, and the button that
// uses them only renders when isDevelopment is true.
const DEV_TEST_EMAIL = 'test@pulsegrid.io';
const DEV_TEST_PASSWORD = 'PulseGrid2026!';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function signIn(targetEmail: string, targetPassword: string): Promise<void> {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const supabase = getBrowserSupabaseClient();
      const { error } = await supabase.auth.signInWithPassword({ email: targetEmail, password: targetPassword });
      if (error) throw new Error(error.message);
      router.push('/discover');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setIsSubmitting(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void signIn(email, password);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0B0D17] px-6 text-slate-100">
      <div className="w-full max-w-sm rounded-2xl border border-[#1E2337] bg-[#131728] p-8">
        <h1 className="text-xl font-semibold text-white">Sign in</h1>
        <p className="mt-1 text-sm text-slate-400">Access the PulseGrid discovery cockpit.</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-[#1E2337] bg-[#0B0D17] px-3 py-2 text-sm text-white focus:border-[#6366F1] focus:outline-none"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-[#1E2337] bg-[#0B0D17] px-3 py-2 text-sm text-white focus:border-[#6366F1] focus:outline-none"
            />
          </div>

          {errorMessage && <p className="text-xs text-rose-400">{errorMessage}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#6366F1] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#5457e5] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <LogIn className="h-4 w-4" />
            {isSubmitting ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        {isDevelopment && (
          <div className="mt-6 border-t border-[#1E2337] pt-6">
            <button
              type="button"
              onClick={() => void signIn(DEV_TEST_EMAIL, DEV_TEST_PASSWORD)}
              disabled={isSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[#6366F1]/50 bg-[#6366F1]/10 px-4 py-2.5 text-sm font-semibold text-[#a5b4fc] transition hover:bg-[#6366F1]/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" />
              Dev Auto-Login as Test Agency
            </button>
            <p className="mt-2 text-center text-[11px] text-slate-600">
              Development only — signs in as {DEV_TEST_EMAIL}, created via src/scripts/create-test-user.ts.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
