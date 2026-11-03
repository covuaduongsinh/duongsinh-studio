/**
 * The issue list's release marks: an issue merged through a linked repository gets a label saying where its work is
 * (in a version, in staging, in production), read in one request for the page's issues.
 */
import { useTranslation } from '@nocobase/i18n/client';

import type { IssueTableColor, IssueTableRow } from '#components/issue-table';
import { useIssueMarks, type IssueWhere } from '#hooks/use-releases';

const COLOR: Readonly<Record<IssueWhere, IssueTableColor | null>> = {
  merged: null,
  released: 'blue',
  staging: 'orange',
  production: 'green',
};

/** A function adding each row's release label, once the marks of `issueIds` are known. */
export function useReleaseLabels(issueIds: readonly string[]): <R extends IssueTableRow>(row: R) => R {
  const { t } = useTranslation();
  const marks = useIssueMarks(issueIds);
  const byIssue = new Map((marks.data ?? []).map((mark) => [mark.issueId, mark]));
  return (row) => {
    const mark = byIssue.get(row.id);
    const color = mark ? COLOR[mark.where] : null;
    if (!mark || !color) return row;
    return {
      ...row,
      labels: [
        ...row.labels,
        { id: `release:${mark.where}`, name: t(`releases.where.${mark.where}`), color },
      ],
    };
  };
}
