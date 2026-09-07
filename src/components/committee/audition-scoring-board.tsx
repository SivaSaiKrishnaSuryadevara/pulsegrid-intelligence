'use client';

import {
  Eye,
  EyeOff,
  ExternalLink,
  Save,
  ShieldAlert,
  Video,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { Avatar } from '@/components/pseo/avatar';
import { getBrowserSupabaseClient } from '@/lib/supabase/client';
import { TALENT_STAGE_STATUSES, type CommitteeRole, type TalentStageStatus } from '@/types/creator';

// =====================================================================================
// Types — co-located here since the page that fetches this data imports
// them directly from this component file.
// =====================================================================================

export interface SubmissionCreatorSummary {
  id: string;
  displayName: string;
  handle: string;
  avatarUrl: string | null;
}

export interface SubmissionVoteSummary {
  id: string;
  memberId: string;
  dialectFitScore: number;
  stagePresenceScore: number;
  deliveryScore: number;
  internalNotes: string | null;
  /** True when memberId === the viewing member's own id. */
  isOwnVote: boolean;
}

export interface SubmissionWithVotes {
  id: string;
  workspaceId: string;
  creator: SubmissionCreatorSummary;
  roleAppliedFor: string | null;
  auditionReelUrl: string | null;
  stageStatus: TalentStageStatus;
  /**
   * Whatever RLS allowed the viewer to see: a REVIEWER's own vote only (blind
   * judging), or every vote for CHAIR/owner. That's what makes the consensus
   * panel and the "confidential" indicator correct without any extra logic
   * here — this component just renders whatever it was handed.
   */
  votes: SubmissionVoteSummary[];
}

export interface AuditionScoringBoardProps {
  /**
   * The viewer's own committee_members row, or `null` if they're accessing
   * as workspace owner without ever having joined as a member — an owner
   * can always manage stage status, but committee_votes.member_id is a
   * required FK, so there is no row to attach a vote to in that case.
   */
  currentMember: { id: string; role: CommitteeRole } | null;
  /** Owner or CHAIR — the only roles allowed to change stage_status. RLS enforces this too; this only drives the UI. */
  isManager: boolean;
  initialSubmissions: SubmissionWithVotes[];
}

const STAGE_STATUS_LABELS: Record<TalentStageStatus, string> = {
  SUBMITTED: 'Submitted',
  SHORTLISTED: 'Shortlisted',
  APPROVED_FOR_BOOKING: 'Approved for Booking',
  REJECTED: 'Rejected',
};

const STAGE_STATUS_TONES: Record<TalentStageStatus, string> = {
  SUBMITTED: 'bg-slate-500/15 text-slate-300 ring-1 ring-inset ring-slate-500/30',
  SHORTLISTED: 'bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-500/30',
  APPROVED_FOR_BOOKING: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/30',
  REJECTED: 'bg-rose-500/15 text-rose-300 ring-1 ring-inset ring-rose-500/30',
};

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function AuditionScoringBoard({ currentMember, isManager, initialSubmissions }: AuditionScoringBoardProps) {
  const [submissions, setSubmissions] = useState<SubmissionWithVotes[]>(initialSubmissions);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(initialSubmissions[0]?.id ?? null);
  const [dialectScore, setDialectScore] = useState(3);
  const [stageScore, setStageScore] = useState(3);
  const [deliveryScore, setDeliveryScore] = useState(3);
  const [notes, setNotes] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [stageStatusUpdating, setStageStatusUpdating] = useState(false);

  const selectedSubmission = submissions.find((submission) => submission.id === selectedSubmissionId) ?? null;
  const ownVote = selectedSubmission?.votes.find((vote) => vote.isOwnVote) ?? null;

  // Re-seed the scoring form whenever the selected submission changes,
  // pre-filling from the viewer's own existing vote (if any).
  useEffect(() => {
    setDialectScore(ownVote?.dialectFitScore ?? 3);
    setStageScore(ownVote?.stagePresenceScore ?? 3);
    setDeliveryScore(ownVote?.deliveryScore ?? 3);
    setNotes(ownVote?.internalNotes ?? '');
    setSaveState('idle');
    setSaveError(null);
    // Re-run only when the selection changes, not on every vote-array
    // mutation from a save (that would fight the form the user is editing).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSubmissionId]);

  async function handleSaveVote(): Promise<void> {
    if (!selectedSubmission || !currentMember) return;
    setSaveState('saving');
    setSaveError(null);

    try {
      const supabase = getBrowserSupabaseClient();
      const { data, error } = await supabase
        .from('committee_votes')
        .upsert(
          {
            submission_id: selectedSubmission.id,
            member_id: currentMember.id,
            dialect_fit_score: dialectScore,
            stage_presence_score: stageScore,
            delivery_score: deliveryScore,
            internal_notes: notes.trim() || null,
          },
          { onConflict: 'submission_id,member_id' }
        )
        .select('id')
        .single();

      if (error) throw new Error(error.message);

      const voteId = (data as { id: string }).id;
      const savedVote: SubmissionVoteSummary = {
        id: voteId,
        memberId: currentMember.id,
        dialectFitScore: dialectScore,
        stagePresenceScore: stageScore,
        deliveryScore: deliveryScore,
        internalNotes: notes.trim() || null,
        isOwnVote: true,
      };

      setSubmissions((prev) =>
        prev.map((submission) =>
          submission.id === selectedSubmission.id
            ? { ...submission, votes: [...submission.votes.filter((vote) => !vote.isOwnVote), savedVote] }
            : submission
        )
      );
      setSaveState('saved');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
      setSaveState('error');
    }
  }

  async function handleStageStatusChange(next: TalentStageStatus): Promise<void> {
    if (!selectedSubmission || !isManager) return;
    setStageStatusUpdating(true);

    try {
      const supabase = getBrowserSupabaseClient();
      const { error } = await supabase
        .from('committee_submissions')
        .update({ stage_status: next })
        .eq('id', selectedSubmission.id);

      if (error) throw new Error(error.message);

      setSubmissions((prev) =>
        prev.map((submission) =>
          submission.id === selectedSubmission.id ? { ...submission, stageStatus: next } : submission
        )
      );
    } catch (err) {
      console.error('[committee] stage status update failed', err);
    } finally {
      setStageStatusUpdating(false);
    }
  }

  if (submissions.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#1E2337] bg-[#131728]/50 py-16 text-center">
        <p className="text-slate-300">No audition submissions have been entered into this workspace yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SubmissionSelector
        submissions={submissions}
        selectedId={selectedSubmissionId}
        onSelect={setSelectedSubmissionId}
      />

      {selectedSubmission && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <AuditionVideoPlayer url={selectedSubmission.auditionReelUrl} />

            {isManager && (
              <div>
                <label
                  htmlFor="stage-status-select"
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500"
                >
                  Stage Status
                </label>
                <select
                  id="stage-status-select"
                  value={selectedSubmission.stageStatus}
                  onChange={(event) => void handleStageStatusChange(event.target.value as TalentStageStatus)}
                  disabled={stageStatusUpdating}
                  className="w-full rounded-lg border border-[#1E2337] bg-[#131728] px-3 py-2 text-sm text-white focus:border-[#6366F1] focus:outline-none disabled:opacity-50"
                >
                  {TALENT_STAGE_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {STAGE_STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <CommitteeConsensusPanel votes={selectedSubmission.votes} isManager={isManager} />
          </div>

          <div className="space-y-5 rounded-2xl border border-[#1E2337] bg-[#131728] p-5">
            {!currentMember ? (
              <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                You&apos;re viewing as workspace owner without a committee membership row, so there&apos;s nothing to
                attach a scorecard to. Add yourself as a committee member to submit scores.
              </div>
            ) : (
              <>
                <ScoreSlider label="Cultural & Dialect Fit" value={dialectScore} onChange={setDialectScore} />
                <ScoreSlider label="Stage Presence & Energy" value={stageScore} onChange={setStageScore} />
                <ScoreSlider label="Delivery & Professionalism" value={deliveryScore} onChange={setDeliveryScore} />

                <LiveScorecardSummary dialect={dialectScore} stage={stageScore} delivery={deliveryScore} />

                <div>
                  <label
                    htmlFor="reviewer-notes"
                    className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500"
                  >
                    Internal Reviewer Notes
                  </label>
                  <textarea
                    id="reviewer-notes"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    rows={4}
                    placeholder="Confidential commentary — visible only to you and workspace managers."
                    className="w-full resize-none rounded-lg border border-[#1E2337] bg-[#0B0D17] px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-[#6366F1] focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void handleSaveVote()}
                    disabled={saveState === 'saving'}
                    className="flex items-center gap-2 rounded-lg bg-[#6366F1] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#5457e5] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Save className="h-4 w-4" />
                    {saveState === 'saving' ? 'Saving…' : 'Save Scorecard'}
                  </button>
                  {saveState === 'saved' && <span className="text-xs font-medium text-emerald-400">Saved ✓</span>}
                  {saveState === 'error' && saveError && <span className="text-xs text-rose-400">{saveError}</span>}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// =====================================================================================
// Submission selector
// =====================================================================================

function SubmissionSelector({
  submissions,
  selectedId,
  onSelect,
}: {
  submissions: SubmissionWithVotes[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2">
      {submissions.map((submission) => (
        <button
          key={submission.id}
          type="button"
          onClick={() => onSelect(submission.id)}
          aria-pressed={submission.id === selectedId}
          className={`flex w-56 shrink-0 flex-col gap-2 rounded-xl border p-3 text-left transition ${
            submission.id === selectedId
              ? 'border-[#6366F1] bg-[#6366F1]/10'
              : 'border-[#1E2337] bg-[#131728] hover:border-[#6366F1]/50'
          }`}
        >
          <div className="flex items-center gap-2">
            <Avatar name={submission.creator.displayName} url={submission.creator.avatarUrl} size={32} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{submission.creator.displayName}</p>
              <p className="truncate text-xs text-slate-500">@{submission.creator.handle}</p>
            </div>
          </div>
          <p className="truncate text-xs text-slate-400">{submission.roleAppliedFor ?? 'General Submission'}</p>
          <span
            className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${STAGE_STATUS_TONES[submission.stageStatus]}`}
          >
            {STAGE_STATUS_LABELS[submission.stageStatus]}
          </span>
        </button>
      ))}
    </div>
  );
}

// =====================================================================================
// Video player
// =====================================================================================

type EmbedKind = 'youtube' | 'instagram' | 'unsupported';

function detectEmbedKind(url: string): EmbedKind {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').replace(/^m\./, '');
    if (host === 'youtube.com' || host === 'youtu.be') return 'youtube';
    if (host === 'instagram.com') return 'instagram';
    return 'unsupported';
  } catch {
    return 'unsupported';
  }
}

function buildYouTubeEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    let videoId: string | null = null;

    if (parsed.hostname.includes('youtu.be')) {
      videoId = parsed.pathname.slice(1);
    } else if (parsed.pathname.startsWith('/embed/')) {
      videoId = parsed.pathname.slice('/embed/'.length);
    } else if (parsed.pathname.startsWith('/shorts/')) {
      videoId = parsed.pathname.slice('/shorts/'.length);
    } else {
      videoId = parsed.searchParams.get('v');
    }

    if (!videoId) return null;
    const cleanId = videoId.split(/[?&/]/)[0];
    return cleanId ? `https://www.youtube-nocookie.com/embed/${cleanId}` : null;
  } catch {
    return null;
  }
}

function buildInstagramEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/(reel|p|tv)\/([^/]+)/);
    if (!match) return null;
    return `https://www.instagram.com/${match[1]}/${match[2]}/embed`;
  } catch {
    return null;
  }
}

function AuditionVideoPlayer({ url }: { url: string | null }) {
  if (!url) {
    return <EmptyPlayerState message="No audition reel submitted for this creator." />;
  }

  const kind = detectEmbedKind(url);

  if (kind === 'youtube') {
    const embedSrc = buildYouTubeEmbedUrl(url);
    if (!embedSrc) return <EmptyPlayerState message="Couldn't parse this YouTube URL." originalUrl={url} />;
    return (
      <div className="aspect-video overflow-hidden rounded-xl border border-[#1E2337] bg-black">
        <iframe
          src={embedSrc}
          title="Audition video (YouTube)"
          className="h-full w-full"
          sandbox="allow-scripts allow-same-origin allow-presentation"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          referrerPolicy="strict-origin-when-cross-origin"
          loading="lazy"
        />
      </div>
    );
  }

  if (kind === 'instagram') {
    const embedSrc = buildInstagramEmbedUrl(url);
    if (!embedSrc) return <EmptyPlayerState message="Couldn't parse this Instagram URL." originalUrl={url} />;
    return (
      <div className="mx-auto aspect-[9/16] max-h-[520px] overflow-hidden rounded-xl border border-[#1E2337] bg-black">
        <iframe
          src={embedSrc}
          title="Audition video (Instagram Reel)"
          className="h-full w-full"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
          referrerPolicy="strict-origin-when-cross-origin"
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <EmptyPlayerState message="This audition link isn't a supported Instagram Reel or YouTube URL." originalUrl={url} />
  );
}

function EmptyPlayerState({ message, originalUrl }: { message: string; originalUrl?: string }) {
  return (
    <div className="flex aspect-video flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[#1E2337] bg-[#131728] p-6 text-center">
      <Video className="h-8 w-8 text-slate-600" />
      <p className="text-sm text-slate-400">{message}</p>
      {originalUrl && (
        <a
          href={originalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-[#818cf8] hover:text-[#a5b4fc]"
        >
          Open link directly <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

// =====================================================================================
// Scoring UI
// =====================================================================================

function ScoreSlider({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="font-medium text-slate-300">{label}</span>
        <span className="font-mono font-semibold text-[#a5b4fc]">{value.toFixed(1)}</span>
      </div>
      <input
        type="range"
        min={1}
        max={5}
        step={0.5}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-[#6366F1]"
      />
      <div className="mt-1 flex justify-between text-[10px] text-slate-600">
        <span>1.0</span>
        <span>5.0</span>
      </div>
    </div>
  );
}

function LiveScorecardSummary({ dialect, stage, delivery }: { dialect: number; stage: number; delivery: number }) {
  const average = (dialect + stage + delivery) / 3;
  return (
    <div className="rounded-xl border border-[#6366F1]/30 bg-[#6366F1]/10 p-4 text-center">
      <p className="text-xs uppercase tracking-wide text-[#a5b4fc]">Live Weighted Average</p>
      <p className="mt-1 text-3xl font-bold text-white">{average.toFixed(2)}</p>
      <p className="mt-1 text-xs text-slate-400">Equal-weighted across Cultural Fit, Stage Presence &amp; Delivery</p>
    </div>
  );
}

// =====================================================================================
// Blind judging / consensus panel
// =====================================================================================

function CommitteeConsensusPanel({ votes, isManager }: { votes: SubmissionVoteSummary[]; isManager: boolean }) {
  if (!isManager) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
        <EyeOff className="h-4 w-4 shrink-0" />
        Scores confidential until reveal — only workspace owners and chairs see the committee average.
      </div>
    );
  }

  if (votes.length === 0) {
    return (
      <div className="rounded-xl border border-[#1E2337] bg-[#131728] p-3 text-xs text-slate-500">
        No committee scorecards submitted for this creator yet.
      </div>
    );
  }

  const average = (key: 'dialectFitScore' | 'stagePresenceScore' | 'deliveryScore') =>
    votes.reduce((sum, vote) => sum + vote[key], 0) / votes.length;

  const dialectAvg = average('dialectFitScore');
  const stageAvg = average('stagePresenceScore');
  const deliveryAvg = average('deliveryScore');
  const overallAvg = (dialectAvg + stageAvg + deliveryAvg) / 3;

  return (
    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
        <Eye className="h-4 w-4" />
        Committee Consensus ({votes.length} scorecard{votes.length === 1 ? '' : 's'})
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2 text-center">
        <ConsensusStat label="Dialect" value={dialectAvg} />
        <ConsensusStat label="Stage" value={stageAvg} />
        <ConsensusStat label="Delivery" value={deliveryAvg} />
        <ConsensusStat label="Overall" value={overallAvg} accent />
      </div>
    </div>
  );
}

function ConsensusStat({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-0.5 text-lg font-bold ${accent ? 'text-emerald-300' : 'text-white'}`}>{value.toFixed(2)}</p>
    </div>
  );
}
