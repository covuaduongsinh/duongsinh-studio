/** Types and definitions for Studio lessons learned (H2a). */
export type LessonTarget =
  'skill' | 'knowledge' | 'sensitivePath' | 'projectCriteria';

export type LessonStatus = 'proposed' | 'accepted' | 'rejected' | 'applied';

export type LessonProposedByType = 'user' | 'agent';

export interface LessonView {
  readonly id: string;
  readonly projectId: string | null;
  readonly issueId: string | null;
  readonly reviewId: string | null;
  readonly mistake: string;
  readonly rule: string;
  readonly tag: string;
  readonly target: LessonTarget;
  readonly targetRef: string | null;
  readonly status: LessonStatus;
  readonly proposedByType: LessonProposedByType;
  readonly proposedById: string | null;
  readonly decidedBy: string | null;
  readonly appliedRef: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProposeLessonInput {
  readonly projectId?: string | null;
  readonly issueId?: string | null;
  readonly reviewId?: string | null;
  readonly mistake: string;
  readonly rule: string;
  readonly tag: string;
  readonly target: LessonTarget;
  readonly targetRef?: string | null;
  readonly proposedByType?: LessonProposedByType;
  readonly proposedById?: string | null;
}

export interface ListLessonsFilter {
  readonly projectId?: string;
  readonly issueId?: string;
  readonly status?: LessonStatus;
  readonly tag?: string;
  readonly limit?: number;
}
