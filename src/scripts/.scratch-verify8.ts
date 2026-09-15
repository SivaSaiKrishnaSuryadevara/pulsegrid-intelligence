import { getServiceRoleClient } from '@/lib/supabase/service';

async function main() {
  const supabase = getServiceRoleClient();
  const handles = ['djzamoradfw', 'davegaseventrentals', 'the_golden_hour_events', 'txbloomproductions', 'aksharadancestudio', 'jusmeshaevents', 'brightievents', 'djpgbrown'];
  const { data, error } = await supabase.from('production_entities').select('handle, avatar_url, entity_details, follower_count').in('handle', handles);
  if (error) { console.error(error); process.exit(1); }
  for (const row of data as any[]) {
    const proofs = row.entity_details?.mediaProofs ?? [];
    const coverUrl = proofs[0]?.displayUrl ?? row.avatar_url;
    const res = await fetch(coverUrl).catch(() => null);
    console.log(`@${row.handle} (followers=${row.follower_count}): ${res ? res.status : 'FETCH FAILED'}`);
  }
}
main();
