export interface PlaybookParam {
  readonly name: string;
  readonly description: string;
  readonly required?: boolean;
  readonly defaultValue?: string;
}

export interface PlaybookCriterion {
  readonly text: string;
  readonly checkKind: 'command' | 'review' | 'manual';
  readonly checkValue?: string | null;
}

export interface PlaybookDefinition {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly skillName: string;
  readonly instructions: string;
  readonly params: readonly PlaybookParam[];
  readonly defaultCriteria: readonly PlaybookCriterion[];
}

export interface ParsedPlaybookInvocation {
  readonly slug: string;
  readonly params: Record<string, string>;
  readonly rawText: string;
}

export interface PlaybookInvocationRecord {
  readonly id: string;
  readonly playbookSlug: string;
  readonly issueId: string;
  readonly commentId: string | null;
  readonly params: Record<string, string>;
  readonly invokedByUserId: string | null;
  readonly createdAt: string;
}
