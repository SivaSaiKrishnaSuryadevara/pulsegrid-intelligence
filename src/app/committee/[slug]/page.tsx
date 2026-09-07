import { Calendar, ClipboardCheck, Users } from 'lucide-react';
import { notFound, redirect } from 'next/navigation';

import {
  AuditionScoringBoard,
  type SubmissionVoteSummary,
  type SubmissionWithVotes,
} from '@/components/committee/audition-scoring-board';
import { getServerSupabaseClient } from '@/lib/supabase/server';
import type { CommitteeRole, MetroHub, PrimaryNiche, TalentStageStatus } from '@/types/creator';

interface CommitteePageProps {
  params: Promise<{ slug: string }>;
}

// =====================================================================================
// Row shapes
// =====================================================================================

interface WorkspaceRow {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  event_date: string | null;
}

interface MemberRow {
  id: string;
  profile_id: string;
  role: CommitteeRole;
}

interface SubmissionRow {
  id: string;
  workspace_id: string;
  role_applied_for: string | null;
  audition_reel_url: string | null;
  stage_status: TalentStageStatus;
  creators: {
    id: string;
    display_name: string;
    handle: string;
    avatar_url: string | null;
    primary_metro: MetroHub;
    primary_niche: PrimaryNiche;
  } | null;
}

interface VoteRow {
  id: string;
  submission_id: string;
  member_id: string;
  dialect_fit_score: string | number;
  stage_presence_score: string | number;
  delivery_score: string | number;
  internal_notes: string | null;
}

// =====================================================================================
// Page
// =====================================================================================

export default async function CommitteeWorkspacePage({ params }: CommitteePageProps) {
  const { slug } = await params;
  const supabase = await getServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=/committee/${slug}`);
  }

  // committee_workspaces_select_owner_or_member (001_init.sql) already
  // gates this on `owner_id = auth.uid() OR is_committee_member(id)` — a
  // non-member simply gets no row back here. Treating that as a plain 404
  // (rather than, say, a 403) avoids confirming to an unauthorized caller
  // that a workspace with this slug even exists.
  const { data: workspaceData, error: workspaceError } = await supabase
    .from('committee_workspaces')
    .select('id, name, slug, owner_id, event_date')
    .eq('slug', slug)
    .maybeSingle();

  if (workspaceError || !workspaceData) {
    notFound();
  }

  const workspace = workspaceData as WorkspaceRow;

  const [membersResult, submissionsResult] = await Promise.all([
    supabase.from('committee_members').select('id, profile_id, role').eq('workspace_id', workspace.id),
    supabase
      .from('committee_submissions')
      .select(
        'id, workspace_id, role_applied_for, audition_reel_url, stage_status, creators(id, display_name, handle, avatar_url, primary_metro, primary_niche)'
      )
      .eq('workspace_id', workspace.id)
      .order('created_at', { ascending: true }),
  ]);

  const members = (membersResult.data ?? []) as unknown as MemberRow[];
  const submissionRows = (submissionsResult.data ?? []) as unknown as SubmissionRow[];
  const submissionIds = submissionRows.map((row) => row.id);

  // Filtered explicitly to this workspace's submissions — RLS on
  // committee_votes scopes visibility (own vote only vs. every vote), not
  // which workspace a row belongs to, so a caller who sits on multiple
  // committees would otherwise see votes bleed in from unrelated ones.
  const { data: voteData } =
    submissionIds.length > 0
      ? await supabase
          .from('committee_votes')
          .select('id, submission_id, member_id, dialect_fit_score, stage_presence_score, delivery_score, internal_notes')
          .in('submission_id', submissionIds)
      : { data: [] as VoteRow[] };

  const currentMemberRow = members.find((member) => member.profile_id === user.id) ?? null;
  const isManager = workspace.owner_id === user.id || currentMemberRow?.role === 'CHAIR';

  const votesBySubmission = new Map<string, VoteRow[]>();
  for (const vote of (voteData ?? []) as unknown as VoteRow[]) {
    const bucket = votesBySubmission.get(vote.submission_id) ?? [];
    bucket.push(vote);
    votesBySubmission.set(vote.submission_id, bucket);
  }

  const submissions: SubmissionWithVotes[] = submissionRows
    .filter((row): row is SubmissionRow & { creators: NonNullable<SubmissionRow['creators']> } => row.creators !== null)
    .map((row) => {
      const votes: SubmissionVoteSummary[] = (votesBySubmission.get(row.id) ?? []).map((vote) => ({
        id: vote.id,
        memberId: vote.member_id,
        // Postgres numeric columns are serialized as JSON strings by
        // PostgREST to avoid float precision loss — Number(...) here
        // converts them back for arithmetic (the live weighted average,
        // consensus panel, etc).
        dialectFitScore: Number(vote.dialect_fit_score),
        stagePresenceScore: Number(vote.stage_presence_score),
        deliveryScore: Number(vote.delivery_score),
        internalNotes: vote.internal_notes,
        isOwnVote: currentMemberRow !== null && vote.member_id === currentMemberRow.id,
      }));

      return {
        id: row.id,
        workspaceId: row.workspace_id,
        creator: {
          id: row.creators.id,
          displayName: row.creators.display_name,
          handle: row.creators.handle,
          avatarUrl: row.creators.avatar_url,
        },
        roleAppliedFor: row.role_applied_for,
        auditionReelUrl: row.audition_reel_url,
        stageStatus: row.stage_status,
        votes,
      };
    });

  const reviewedCount = submissions.filter((submission) => submission.votes.length > 0).length;

  return (
    <main className="min-h-screen bg-[#0B0D17] text-slate-100">
      <header className="border-b border-[#1E2337] bg-gradient-to-b from-[#131728] to-[#0B0D17] px-6 py-10 sm:px-10">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#a5b4fc]">Committee Workspace</p>
          <h1 className="mt-2 text-3xl font-bold text-white">{workspace.name}</h1>
          <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-400">
            <HeaderStat icon={Calendar} label={formatEventCountdown(workspace.event_date)} />
            <HeaderStat icon={Users} label={`${members.length} member${members.length === 1 ? '' : 's'}`} />
            <HeaderStat icon={ClipboardCheck} label={`${reviewedCount} of ${submissions.length} submissions reviewed`} />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-10 sm:px-10">
        <AuditionScoringBoard
          currentMember={currentMemberRow ? { id: currentMemberRow.id, role: currentMemberRow.role } : null}
          isManager={isManager}
          initialSubmissions={submissions}
        />
      </div>
    </main>
  );
}

// =====================================================================================
// Helpers
// =====================================================================================

function formatEventCountdown(eventDateIso: string | null): string {
  if (!eventDateIso) return 'Event date TBD';

  const eventDate = new Date(`${eventDateIso}T00:00:00.000Z`);
  const todayIso = new Date().toISOString().slice(0, 10);
  const today = new Date(`${todayIso}T00:00:00.000Z`);
  const diffDays = Math.round((eventDate.getTime() - today.getTime()) / 86_400_000);

  if (diffDays > 1) return `${diffDays} days until event`;
  if (diffDays === 1) return 'Event is tomorrow';
  if (diffDays === 0) return 'Event day!';
  return 'Event has passed';
}

function HeaderStat({ icon: Icon, label }: { icon: typeof Calendar; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="h-4 w-4 text-[#6366F1]" />
      {label}
    </span>
  );
}
