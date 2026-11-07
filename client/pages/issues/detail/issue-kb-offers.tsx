/** What agents suggest keeping as knowledge from this issue's files, for the person who decides (`/api/kb/offers`). */
import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import { Badge } from '#components/ui/badge';
import { Button } from '#components/ui/button';

interface KbOffer {
  readonly id: string;
  readonly attachmentId: string;
  readonly reason: string;
  readonly status: 'pending' | 'saving' | 'saved' | 'declined';
  readonly canDecide: boolean;
}

export function IssueKbOffers({
  issueId,
}: {
  readonly issueId: string;
}): ReactElement | null {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const queryClient = useQueryClient();
  const key = ['kb-offers', issueId];
  const offers = useQuery({
    queryKey: key,
    retry: false,
    queryFn: async ({ signal }) =>
      (
        await api.request<{ data: KbOffer[] }>({
          path: 'kb/offers',
          query: { issueId },
          signal,
        })
      ).data,
  });
  const decide = useMutation({
    mutationFn: ({
      id,
      action,
    }: {
      readonly id: string;
      readonly action: 'accept' | 'reject';
    }) =>
      api.request({
        method: 'POST',
        path: `kb/offers/${id}/${action}`,
        json: {},
      }),
    onError: () => {
      toaster.show({ type: 'error', title: t('kbOffers.failed') });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });

  if (!offers.data || offers.data.length === 0) return null;
  return (
    <section
      aria-label={t('kbOffers.title')}
      className='flex flex-col gap-2 rounded-md border p-3 text-sm'
    >
      <h3 className='font-medium'>{t('kbOffers.title')}</h3>
      <ul className='flex flex-col gap-2'>
        {offers.data.map((offer) => (
          <li key={offer.id} className='flex flex-wrap items-center gap-2'>
            <span className='min-w-0 flex-1'>{offer.reason}</span>
            {offer.status === 'pending' && offer.canDecide ? (
              <>
                <Button
                  disabled={decide.isPending}
                  size='sm'
                  onClick={() =>
                    decide.mutate({ id: offer.id, action: 'accept' })
                  }
                >
                  {t('kbOffers.accept')}
                </Button>
                <Button
                  disabled={decide.isPending}
                  size='sm'
                  variant='ghost'
                  onClick={() =>
                    decide.mutate({ id: offer.id, action: 'reject' })
                  }
                >
                  {t('kbOffers.reject')}
                </Button>
              </>
            ) : (
              <Badge variant='secondary'>
                {t(`kbOffers.status.${offer.status}`)}
              </Badge>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
