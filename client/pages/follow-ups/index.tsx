/** `/follow-ups`: the open issues the viewer takes part in, with what is new since they last looked. */
import { useTranslation } from '@nocobase/i18n/client';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { Badge } from '#components/ui/badge';
import { Button } from '#components/ui/button';
import { Skeleton } from '#components/ui/skeleton';
import { useFollowUpAction, useFollowUps } from '#hooks/use-follow-ups';

const GROUPS = ['in_review', 'blocked', 'in_progress', 'backlog'] as const;

export default function FollowUpsPage(): ReactElement {
  const { t } = useTranslation();
  const followUps = useFollowUps();
  const act = useFollowUpAction();
  const issues = followUps.data?.issues ?? [];

  return (
    <PageContainer>
      <PageHeader
        title={t('followUps.title')}
        description={t('followUps.description')}
      />
      {followUps.isLoading ? (
        <Skeleton className='h-40 w-full' aria-label={t('followUps.loading')} />
      ) : followUps.isError ? (
        <p className='text-sm text-destructive'>{t('followUps.failed')}</p>
      ) : issues.length === 0 ? (
        <p className='text-sm text-muted-foreground'>{t('followUps.empty')}</p>
      ) : (
        <div className='flex flex-col gap-6'>
          {GROUPS.map((group) => {
            const members = issues.filter((issue) => issue.statusKey === group);
            if (members.length === 0) return null;
            return (
              <section key={group} aria-label={t(`followUps.group.${group}`)}>
                <h3 className='mb-2 flex items-center gap-2 text-sm font-medium'>
                  {t(`followUps.group.${group}`)}
                  <Badge variant='secondary'>{members.length}</Badge>
                </h3>
                <ul className='flex flex-col divide-y rounded-md border'>
                  {members.map((issue) => (
                    <li
                      key={issue.id}
                      className='flex flex-wrap items-center gap-x-3 gap-y-1 p-3 text-sm'
                    >
                      <Link
                        className='font-medium underline-offset-4 hover:underline'
                        to={`/issues/${issue.id}`}
                        onClick={() =>
                          act.mutate({ issueId: issue.id, action: 'markSeen' })
                        }
                      >
                        {issue.identifier} {issue.title}
                      </Link>
                      {issue.unread > 0 ? (
                        <Badge>
                          {t('followUps.unread', { count: issue.unread })}
                        </Badge>
                      ) : null}
                      {issue.executorName ? (
                        <span className='text-muted-foreground'>
                          {issue.executorName}
                        </span>
                      ) : null}
                      <Button
                        className='ml-auto'
                        size='sm'
                        variant='ghost'
                        disabled={act.isPending}
                        onClick={() =>
                          act.mutate({
                            issueId: issue.id,
                            action: issue.followed ? 'unfollow' : 'follow',
                          })
                        }
                      >
                        {t(
                          issue.followed
                            ? 'followUps.unfollow'
                            : 'followUps.follow',
                        )}
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
