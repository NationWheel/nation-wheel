/**
 * Intelligence / Secret Service visibility rule.
 *
 * Rule (as specified):
 *   A nation with intel rank R can see the actions of any nation whose
 *   action was filed at confidentiality level <= R.
 *   A nation cannot see actions filed above its own intel rank.
 *   Public information (name, flag, public summary, turn status) is
 *   ALWAYS visible regardless of intel rank — intel rank only gates
 *   the "actions" feed, not nation existence or public metadata.
 *
 * This file has zero DB/network dependencies on purpose: it's the one
 * piece of business logic that absolutely must be unit-testable and
 * impossible to drift between client and server. The API route is the
 * only caller, and it always re-derives the viewer's rank from the DB —
 * never from a client-supplied value.
 */

export const MIN_INTEL_RANK = 1;
export const MAX_INTEL_RANK = 9;

export function clampIntelRank(rank: number): number {
  return Math.min(MAX_INTEL_RANK, Math.max(MIN_INTEL_RANK, Math.round(rank)));
}

/**
 * Can a viewer with `viewerRank` see an action filed at `actionConfidentiality`?
 *
 * Self-visibility is handled by the caller (a nation can always see its
 * own actions in full, regardless of rank) — this function only answers
 * the cross-nation question.
 */
export function canViewAction(viewerRank: number, actionConfidentiality: number): boolean {
  return viewerRank >= actionConfidentiality;
}

export type VisibleAction = {
  id: string;
  nationId: string;
  week: number;
  category: string;
  description: string;
  confidentialityLevel: number;
};

export type RedactedAction = {
  id: string;
  nationId: string;
  week: number;
  redacted: true;
};

export type ActionView = VisibleAction | RedactedAction;

/**
 * Filters a raw action list down to what `viewerRank` is allowed to see
 * in full. Actions above the viewer's rank are not dropped silently —
 * they're returned redacted, so the UI can still show "an action exists
 * here but you lack the intel rank to see it," which is the honest
 * representation of "higher-rank nations don't reveal their actions."
 *
 * `viewerIsOwner` bypasses the rank check entirely: a nation's own
 * actions are always fully visible to itself and to GMs/admins.
 */
export function filterActionsForViewer(
  actions: Array<{
    id: string;
    nationId: string;
    week: number;
    category: string;
    description: string;
    confidentialityLevel: number;
  }>,
  viewerRank: number,
  viewerIsOwnerOrPrivileged: boolean
): ActionView[] {
  if (viewerIsOwnerOrPrivileged) {
    return actions.map((a) => ({ ...a }));
  }

  return actions.map((a) => {
    if (canViewAction(viewerRank, a.confidentialityLevel)) {
      return { ...a };
    }
    return {
      id: a.id,
      nationId: a.nationId,
      week: a.week,
      redacted: true as const,
    };
  });
}
