import type { CreatorCardModel } from '@/types/creator';

/**
 * Data-driven specialty label — real genre/style fields where the entity
 * has them, not a fabricated sub-category. Shared by `VisualCreatorCard`
 * and the detail drawer's booking-brief pre-fill so the two surfaces never
 * describe the same creator differently.
 */
export function getSpecialtyLabel(creator: CreatorCardModel): string {
  const details = creator.entityDetails;
  switch (details.kind) {
    case 'local_dj':
      return details.genreTags?.[0] ? `${details.genreTags[0]} DJ` : 'Baraat DJ';
    case 'stage_emcee':
      return creator.secondaryLanguages[0] ? `${creator.secondaryLanguages[0]} Emcee` : 'Emcee / Host';
    case 'dance_troupe':
      return details.style ? `${details.style} Choreography` : 'Dance Troupe';
    case 'event_planner':
      return 'Event Planner';
    case 'solo_creator':
    default:
      return 'Content Creator';
  }
}
