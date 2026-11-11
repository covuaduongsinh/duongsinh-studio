export type SecretFindingStatus = 'active' | 'resolved' | 'ignored';

export interface SecretFinding {
  readonly id: string;
  readonly issueId: string | null;
  readonly commentId: string | null;
  readonly patternKey: string;
  readonly fingerprint: string;
  readonly status: SecretFindingStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RecordFindingsParams {
  readonly issueId: string;
  readonly commentId?: string | null;
  readonly matches: readonly {
    readonly patternKey: string;
    readonly fingerprint: string;
  }[];
  readonly ownerUserId?: string | null;
  readonly issueIdentifier?: string | null;
}
