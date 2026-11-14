import { useTranslation } from '@nocobase/i18n/client';
import {
  CircleAlertIcon,
  CircleCheckIcon,
  CircleHelpIcon,
  LoaderCircle,
  RefreshCwIcon,
} from 'lucide-react';
import type { ReactElement } from 'react';

import { Button } from '#components/ui/button';
import { ProjectSection } from '#extensions/nocobase-project-detail/project-detail';
import { useBranchProtection } from '#hooks/use-branch-protection';

/** What the repository's default branch asks of a merge, and what to press on GitHub to fix it (plan T, T3a). */
export function ProjectBranchProtection({
  projectId,
  canManage,
}: {
  readonly projectId: string;
  readonly canManage: boolean;
}): ReactElement | null {
  const { t } = useTranslation();
  const query = useBranchProtection(projectId, canManage);
  if (!canManage) return null;
  const data = query.data;
  const tone =
    data?.verdict === 'ok'
      ? 'ok'
      : data?.verdict === 'problem'
        ? 'problem'
        : 'unknown';
  return (
    <ProjectSection
      title={t('branchProtection.title')}
      description={t('branchProtection.description')}
    >
      <div className='flex flex-col gap-3'>
        {query.isPending ? (
          <div className='flex items-center gap-2 text-sm text-muted-foreground'>
            <LoaderCircle className='size-4 animate-spin' />
            {t('branchProtection.loading')}
          </div>
        ) : query.isError ? (
          <p className='text-sm text-destructive'>
            {t('branchProtection.error')}
          </p>
        ) : data?.status === 'noRepository' ? (
          <p className='text-sm text-muted-foreground'>
            {t('branchProtection.noRepository')}
          </p>
        ) : data?.status === 'unreadable' ? (
          <div className='flex items-start gap-2 text-sm'>
            <CircleHelpIcon className='mt-0.5 size-4 shrink-0 text-muted-foreground' />
            <span>
              {t('branchProtection.unreadable', {
                repository: data.repository ?? '',
                status: data.httpStatus ?? 0,
              })}
            </span>
          </div>
        ) : data ? (
          <>
            <div className='flex items-start gap-2 text-sm font-medium'>
              {tone === 'ok' ? (
                <CircleCheckIcon className='mt-0.5 size-4 shrink-0 text-(--status-success)' />
              ) : tone === 'problem' ? (
                <CircleAlertIcon className='mt-0.5 size-4 shrink-0 text-destructive' />
              ) : (
                <CircleHelpIcon className='mt-0.5 size-4 shrink-0 text-muted-foreground' />
              )}
              <span>
                {t(`branchProtection.verdict.${tone}`, {
                  repository: data.repository ?? '',
                  branch: data.branch ?? '',
                })}
              </span>
            </div>
            <ul className='flex list-disc flex-col gap-1 pl-6 text-sm'>
              {data.problems.map((problem) => (
                <li key={problem}>
                  {t(`branchProtection.problems.${problem}`)}
                </li>
              ))}
              {data.unknowns.map((unknown) => (
                <li key={unknown} className='text-muted-foreground'>
                  {t(`branchProtection.unknowns.${unknown}`)}
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {data?.verdict !== 'ok' ? (
          <ol className='flex list-decimal flex-col gap-1 pl-6 text-sm text-muted-foreground'>
            {[1, 2, 3, 4].map((step) => (
              <li key={step}>{t(`branchProtection.steps.${step}`)}</li>
            ))}
          </ol>
        ) : null}
        <div>
          <Button
            variant='outline'
            size='sm'
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCwIcon
              className={query.isFetching ? 'animate-spin' : undefined}
            />
            {t('branchProtection.recheck')}
          </Button>
        </div>
      </div>
    </ProjectSection>
  );
}
