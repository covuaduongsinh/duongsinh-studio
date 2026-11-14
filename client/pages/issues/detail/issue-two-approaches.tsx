import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useMutation } from '@tanstack/react-query';
import { LoaderCircle, SplitIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import { Button } from '#components/ui/button';

/** Asks two agents of different providers for an approach each; only when pressed (plan T, T12, Q8). */
export function IssueTwoApproaches({
  issueId,
  canEdit,
}: {
  readonly issueId: string;
  readonly canEdit: boolean;
}): ReactElement | null {
  const { t } = useTranslation();
  const toaster = useToaster();
  const api = useApiClient();
  const ask = useMutation({
    mutationFn: async () =>
      (
        await api.request<{ data: { runs: { agentName: string }[] } }>({
          path: `issues/${issueId}/twoApproaches`,
          method: 'POST',
          json: {},
        })
      ).data,
  });
  if (!canEdit) return null;
  return (
    <div className='flex flex-col gap-1'>
      <Button
        variant='outline'
        size='sm'
        disabled={ask.isPending}
        onClick={() =>
          ask.mutate(undefined, {
            onSuccess: (result) =>
              toaster.show({
                type: 'success',
                title: t('twoApproaches.asked'),
                description: result.runs
                  .map((run) => run.agentName)
                  .join(' · '),
              }),
            onError: (error) =>
              toaster.show({
                type: 'error',
                title: t('twoApproaches.failed'),
                description:
                  error instanceof Error ? error.message : String(error),
              }),
          })
        }
      >
        {ask.isPending ? (
          <LoaderCircle className='animate-spin' />
        ) : (
          <SplitIcon />
        )}
        {t('twoApproaches.action')}
      </Button>
      <span className='text-xs text-muted-foreground'>
        {t('twoApproaches.hint')}
      </span>
    </div>
  );
}
