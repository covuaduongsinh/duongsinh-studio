/** What a review needs to say about the issue's latest verification (plan T, T2). */
export interface VerificationForReview {
  readonly result: string;
  readonly items: readonly {
    readonly checkKind: string;
    readonly exitCode: number | null;
  }[];
}

/**
 * Why a review may not approve over `verification`, or null. A review that approves has read the output of every test
 * and command the agent ran (`checklist.verificationOutputReviewed === true`), and never approves over a verification
 * CI contradicted. A review asking for changes needs neither.
 */
export function verificationReviewProblem(
  verification: VerificationForReview | null,
  verdict: string,
  checklist: Readonly<Record<string, unknown>> | undefined,
): 'VERIFICATION_CONTRADICTED' | 'VERIFICATION_OUTPUT_NOT_REVIEWED' | null {
  if (!verification || verdict !== 'approve') return null;
  if (verification.result === 'contradicted')
    return 'VERIFICATION_CONTRADICTED';
  const ranCommands = verification.items.some(
    (item) => item.checkKind === 'test' || item.checkKind === 'command',
  );
  if (ranCommands && checklist?.verificationOutputReviewed !== true)
    return 'VERIFICATION_OUTPUT_NOT_REVIEWED';
  return null;
}
