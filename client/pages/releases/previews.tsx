/**
 * Previews and staging of NocoBase 2 (S5.6): one preview slot at preview.dsc.edu.vn for pull requests labelled
 * `preview`, and staging from the default branch. Opening counts as use (an unused preview stops after 30 minutes); the
 * sign-in is shown only to whoever may edit the issue.
 */
import { useTranslation } from '@nocobase/i18n/client';
import { ExternalLinkIcon, KeyRoundIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { Badge } from '#components/ui/badge';
import { Button } from '#components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#components/ui/table';
import {
  usePreviewAction,
  usePreviewCredentials,
  usePreviews,
  type Preview,
  type PreviewStatus,
} from '#hooks/use-releases';

const STATUS_VARIANT: Readonly<Record<PreviewStatus, 'default' | 'secondary' | 'outline' | 'destructive'>> = {
  ready: 'default',
  deploying: 'secondary',
  waiting: 'secondary',
  stopped: 'outline',
  blocked: 'outline',
  failed: 'destructive',
  destroyed: 'outline',
};

export function PreviewStatusBadge({ status }: { readonly status: PreviewStatus }): ReactElement {
  const { t } = useTranslation();
  return <Badge variant={STATUS_VARIANT[status]}>{t(`releases.preview.status.${status}`)}</Badge>;
}

function Credentials({ previewId }: { readonly previewId: string }): ReactElement {
  const { t } = useTranslation();
  const credentials = usePreviewCredentials(previewId);
  if (credentials.error) return <p className='text-sm text-muted-foreground'>{t('releases.preview.noCredentials')}</p>;
  if (!credentials.data) return <p className='text-sm text-muted-foreground'>{t('releases.preview.loading')}</p>;
  return (
    <dl className='grid grid-cols-[auto_1fr] gap-x-3 text-sm'>
      <dt className='text-muted-foreground'>{t('releases.preview.basicUser')}</dt>
      <dd className='font-mono'>{credentials.data.basicUser}</dd>
      <dt className='text-muted-foreground'>{t('releases.preview.basicPassword')}</dt>
      <dd className='font-mono'>{credentials.data.basicPassword}</dd>
      <dt className='text-muted-foreground'>{t('releases.preview.account')}</dt>
      <dd className='font-mono'>{credentials.data.account}</dd>
      <dt className='text-muted-foreground'>{t('releases.preview.password')}</dt>
      <dd className='font-mono'>{credentials.data.password}</dd>
    </dl>
  );
}

/** One preview's link, sign-in and actions. */
export function PreviewCard({ preview }: { readonly preview: Preview }): ReactElement {
  const { t } = useTranslation();
  const action = usePreviewAction();
  const [showCredentials, setShowCredentials] = useState(false);
  const live = preview.status === 'ready' || preview.status === 'stopped';
  const openPreview = () =>
    action.mutate(
      { id: preview.id, action: 'open' },
      {
        onSuccess: (opened) => {
          if (opened.url) window.open(opened.url, '_blank', 'noopener');
        },
      },
    );
  return (
    <div className='flex flex-col gap-2'>
      <p className='flex flex-wrap items-center gap-2 text-sm'>
        <PreviewStatusBadge status={preview.status} />
        <span className='font-mono'>{preview.sha.slice(0, 7)}</span>
        {preview.reason ? <span className='text-muted-foreground'>{preview.reason}</span> : null}
      </p>
      <div className='flex flex-wrap gap-2'>
        {live && preview.url ? (
          <Button size='sm' onClick={openPreview} disabled={action.isPending}>
            <ExternalLinkIcon aria-hidden='true' />
            {t('releases.preview.open')}
          </Button>
        ) : null}
        {live ? (
          <Button size='sm' variant='outline' onClick={() => setShowCredentials((value) => !value)} aria-expanded={showCredentials}>
            <KeyRoundIcon aria-hidden='true' />
            {t('releases.preview.signIn')}
          </Button>
        ) : null}
        {preview.status !== 'destroyed' ? (
          <Button
            size='sm'
            variant='outline'
            onClick={() => action.mutate({ id: preview.id, action: 'retry' })}
            disabled={action.isPending}
          >
            <RefreshCwIcon aria-hidden='true' />
            {t('releases.preview.retry')}
          </Button>
        ) : null}
        {preview.status !== 'destroyed' && preview.slot === 'preview' ? (
          <Button
            size='sm'
            variant='outline'
            onClick={() => action.mutate({ id: preview.id, action: 'down' })}
            disabled={action.isPending}
          >
            <Trash2Icon aria-hidden='true' />
            {t('releases.preview.down')}
          </Button>
        ) : null}
        {preview.logsUrl ? (
          <a
            className='self-center text-sm underline underline-offset-4'
            href={preview.logsUrl}
            target='_blank'
            rel='noreferrer'
          >
            {t('releases.preview.build')}
          </a>
        ) : null}
      </div>
      {action.isError ? (
        <p role='alert' className='text-sm text-destructive'>
          {t('releases.preview.failed')}
        </p>
      ) : null}
      {showCredentials ? <Credentials previewId={preview.id} /> : null}
    </div>
  );
}

/** The Previews and Staging tabs of `/releases`. */
export function PreviewsTab({ slot }: { readonly slot: 'preview' | 'staging' }): ReactElement {
  const { t, i18n } = useTranslation();
  const previews = usePreviews();
  if (previews.error)
    return (
      <p role='alert' className='text-sm text-destructive'>
        {t('releases.loadFailed')}
      </p>
    );
  const rows = (previews.data ?? []).filter((item) => item.slot === slot && item.status !== 'destroyed');
  if (rows.length === 0)
    return (
      <p className='text-sm text-muted-foreground'>
        {t(slot === 'preview' ? 'releases.previews.description' : 'releases.preview.noStaging')}
      </p>
    );
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('releases.preview.subject')}</TableHead>
          <TableHead>{t('releases.columns.where')}</TableHead>
          <TableHead>{t('releases.columns.updated')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((preview) => (
          <TableRow key={preview.id}>
            <TableCell>
              {preview.pullNumber === null ? preview.branch : t('releases.preview.pull', { number: preview.pullNumber })}
            </TableCell>
            <TableCell>
              <PreviewCard preview={preview} />
            </TableCell>
            <TableCell>
              <time dateTime={preview.updatedAt}>
                {new Date(preview.updatedAt).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short' })}
              </time>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
