const flagKey = (userId: string) => `clareia:legacy-import:${userId}`;

export type LegacyDecision = 'imported' | 'dismissed';

export function getLegacyDecision(userId: string): LegacyDecision | null {
  const value = localStorage.getItem(flagKey(userId));
  return value === 'imported' || value === 'dismissed' ? value : null;
}

export function setLegacyDecision(userId: string, decision: LegacyDecision): void {
  localStorage.setItem(flagKey(userId), decision);
}
