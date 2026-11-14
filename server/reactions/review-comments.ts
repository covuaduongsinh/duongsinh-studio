/**
 * What a person's review on a pull request means for the reaction rules (plan T, T1.3). Pure, so the decision to wake the
 * author is tested without GitHub.
 */

type Json = Record<string, unknown>;

const obj = (value: unknown): Json =>
  typeof value === 'object' && value !== null ? (value as Json) : {};
const text = (value: unknown): string =>
  typeof value === 'string' ? value : '';

/** GitHub's own word for who may write on the repository; a stranger's review wakes nobody. */
const TRUSTED = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);

export type ReviewFromPayload =
  | { readonly accept: false; readonly reason: string }
  | {
      readonly accept: true;
      readonly reviewId: string;
      readonly number: number;
      readonly headSha: string;
      readonly reviewer: string;
      readonly body: string;
    };

/** A bot, or Studio's own agent identity (`ds-agent`), never wakes the author with a review of its own. */
const isAutomated = (user: Json): boolean => {
  const login = text(user.login).toLowerCase();
  return (
    user.type === 'Bot' || login.endsWith('[bot]') || login.includes('ds-agent')
  );
};

export function reviewFromPayload(payload: Json): ReviewFromPayload {
  if (payload.action !== 'submitted')
    return { accept: false, reason: 'notSubmitted' };
  const review = obj(payload.review);
  const state = text(review.state).toLowerCase();
  if (state !== 'changes_requested' && state !== 'commented')
    return { accept: false, reason: 'notAskingForChanges' };
  if (isAutomated(obj(payload.sender)) || isAutomated(obj(review.user)))
    return { accept: false, reason: 'automated' };
  if (!TRUSTED.has(text(review.author_association).toUpperCase()))
    return { accept: false, reason: 'notTrusted' };
  const number = Number(obj(payload.pull_request).number);
  if (!Number.isInteger(number) || number <= 0)
    return { accept: false, reason: 'noPullRequest' };
  return {
    accept: true,
    reviewId:
      typeof review.id === 'number' || typeof review.id === 'string'
        ? String(review.id)
        : '',
    number,
    headSha: text(review.commit_id),
    reviewer: text(obj(review.user).login) || 'reviewer',
    body: text(review.body),
  };
}

export interface ReviewLineComment {
  readonly path: string;
  readonly line: number | null;
  readonly body: string;
}

/** What the author is told: the review and every comment with the file and line it sits on. */
export function reviewReactionText(input: {
  readonly number: number;
  readonly reviewer: string;
  readonly body: string;
  readonly comments: readonly ReviewLineComment[];
}): string {
  const lines = [
    `${input.reviewer} đã review pull request #${input.number} và xin sửa:`,
  ];
  if (input.body.trim()) lines.push('', input.body.trim());
  for (const comment of input.comments)
    lines.push(
      '',
      `- ${comment.path}${comment.line ? `:${comment.line}` : ''}: ${comment.body.trim()}`,
    );
  lines.push('', 'Sửa từng điểm, chạy lại kiểm chứng rồi đẩy.');
  return lines.join('\n');
}
