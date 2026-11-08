/**
 * The inbox's "Needs my decision" feed of production marks: requests someone made for the owner to record a version
 * as on production (`server/routes/deploys.ts`). Approving types the App id again, as the releases plugin asks for a
 * protected environment; rejecting needs a reason. Only the owner sees any (the server answers others none).
 */
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { Loading } from '#components/loading';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import { Textarea } from '#components/ui/textarea';
import {
  useDecideRequest,
  useDeploymentRequest,
  type DeploymentRequest,
} from '#hooks/use-releases';

export function RequestList({
  items,
  selectedId,
  onSelect,
}: {
  readonly items: readonly DeploymentRequest[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
}): ReactElement {
  const { t, i18n } = useTranslation();
  return (
    <section
      aria-label={t('releases.inbox.section')}
      className='flex flex-col gap-1'
    >
      <h2 className='px-2 text-xs font-medium text-muted-foreground'>
        {t('releases.inbox.section')}
      </h2>
      <ul className='flex flex-col gap-1'>
        {items.map((item) => (
          <li key={item.id}>
            <button
              type='button'
              aria-current={item.id === selectedId ? 'true' : undefined}
              onClick={() => onSelect(item.id)}
              className='flex w-full flex-col rounded-md px-2 py-1.5 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-[current=true]:bg-muted'
            >
              <span className='text-sm font-medium'>
                {t('releases.inbox.item', { repo: item.repo, tag: item.tag })}
              </span>
              <span className='text-xs text-muted-foreground'>
                {t('releases.inbox.requestedAt', {
                  time: new Date(item.createdAt).toLocaleString(i18n.language, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }),
                })}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function RequestDetail({
  id,
  onBack,
}: {
  readonly id: string;
  readonly onBack: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const request = useDeploymentRequest(id);
  const decide = useDecideRequest();
  const [appId, setAppId] = useState('');
  const [note, setNote] = useState('');
  if (request.error)
    return (
      <p role='alert' className='text-sm text-destructive'>
        {t('releases.loadFailed')}
      </p>
    );
  if (!request.data) return <Loading />;
  const data = request.data;
  const waiting = data.status === 'pending';
  return (
    <div className='flex flex-col gap-4 p-4'>
      <div>
        <h2 className='font-heading text-lg font-semibold'>
          {t('releases.inbox.item', { repo: data.repo, tag: data.tag })}
        </h2>
        <p className='mt-1 text-sm text-muted-foreground'>
          {t('releases.inbox.note')}: {data.note}
        </p>
      </div>
      {waiting ? (
        <div className='flex flex-col gap-3'>
          <div className='flex flex-col gap-1.5'>
            <Label htmlFor='release-decision-app'>
              {t('releases.inbox.appId', { appId: data.appId })}
            </Label>
            <Input
              id='release-decision-app'
              value={appId}
              onChange={(event) => setAppId(event.target.value)}
              autoComplete='off'
            />
          </div>
          <div className='flex flex-col gap-1.5'>
            <Label htmlFor='release-decision-note'>
              {t('releases.inbox.decisionNote')}
            </Label>
            <Textarea
              id='release-decision-note'
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          {decide.error ? (
            <p role='alert' className='text-sm text-destructive'>
              {t('releases.inbox.failed')}
            </p>
          ) : null}
          <div className='flex gap-2'>
            <Button
              disabled={decide.isPending || appId.trim() !== data.appId}
              onClick={() =>
                decide.mutate(
                  {
                    id: data.id,
                    approve: true,
                    confirmAppId: appId.trim(),
                    ...(note.trim() ? { note: note.trim() } : {}),
                  },
                  { onSuccess: onBack },
                )
              }
            >
              {t('releases.inbox.approve')}
            </Button>
            <Button
              variant='outline'
              disabled={decide.isPending || !note.trim()}
              onClick={() =>
                decide.mutate(
                  { id: data.id, approve: false, note: note.trim() },
                  { onSuccess: onBack },
                )
              }
            >
              {t('releases.inbox.reject')}
            </Button>
            <Button variant='ghost' onClick={onBack}>
              {t('releases.inbox.back')}
            </Button>
          </div>
        </div>
      ) : (
        <p className='text-sm text-muted-foreground'>
          {t('releases.inbox.empty')}
        </p>
      )}
    </div>
  );
}
