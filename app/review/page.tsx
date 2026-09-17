import { redirect } from 'next/navigation';

/**
 * The Review queue is now part of Signals.
 *
 * It was a list whose every row linked to /signals/[id], so it could not do
 * anything the signal page did not already do. Worse, the two screens counted
 * the same work differently: Review listed one row per artefact and showed 87
 * pending, while Signals counted drafts and showed 6, for the same fifteen
 * signals. Its summary and its urgency ordering moved onto Signals, which is
 * where the work was always finished.
 *
 * This redirect stays so existing links and bookmarks still land somewhere.
 */
export default function ReviewPage() {
  redirect('/signals');
}
