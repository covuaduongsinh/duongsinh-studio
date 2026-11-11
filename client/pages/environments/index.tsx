/**
 * `/environments`: Dương Sinh's hosted environments as Studio knows them (preview, staging, production). All run
 * outside Studio, on the VPS or through Dokploy; Studio records what runs where.
 */
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { PlusIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { Loading } from '#components/loading';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Badge } from '#components/ui/badge';
import { buttonVariants } from '#components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';
import { useReleaseEnvironments } from '#hooks/use-releases';

export default function EnvironmentsPage(): ReactElement {
  const { t } = useTranslation();
  const environments = useReleaseEnvironments();
  // Creating one is the releases plugin's: its page builds the form from each driver's settings. Only whoever manages
  // environments there is offered the way in (the plugin's API checks it again).
  const { can: canManage } = useCan({
    resource: { type: 'settings', id: 'rel.environments' },
    action: 'manage',
  });
  let body: ReactElement;
  if (environments.error)
    body = (
      <p role='alert' className='text-sm text-destructive'>
        {t('releases.loadFailed')}
      </p>
    );
  else if (!environments.data) body = <Loading />;
  else
    body = (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('environments.columns.name')}</TableHead>
            <TableHead>{t('environments.columns.purpose')}</TableHead>
            <TableHead>{t('environments.columns.runsOn')}</TableHead>
            <TableHead>{t('environments.columns.apps')}</TableHead>
            <TableHead>{t('environments.columns.policy')}</TableHead>
            <TableHead>{t('environments.columns.approvers')}</TableHead>
            <TableHead>{t('environments.columns.url')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {environments.data.map((env) => (
            <TableRow key={env.key}>
              <TableCell>
                <span className='font-medium'>{env.name}</span>{' '}
                <span className='font-mono text-xs text-muted-foreground'>
                  ({env.key})
                </span>
                {env.description ? (
                  <p className='mt-1 max-w-md text-xs text-muted-foreground'>
                    {env.description}
                  </p>
                ) : null}
              </TableCell>
              <TableCell>
                {t(`environments.purposes.${env.purpose}`, {
                  defaultValue: env.purpose,
                })}
              </TableCell>
              <TableCell>
                {t(`environments.runsOn.${env.runsOn}`, {
                  defaultValue: env.runsOn,
                })}
              </TableCell>
              <TableCell>
                {env.maxApps === null
                  ? '—'
                  : t('environments.maxApps', { count: env.maxApps })}
                {env.idleStopMinutes !== null ? (
                  <p className='text-xs text-muted-foreground'>
                    {t('environments.idleStop', {
                      minutes: env.idleStopMinutes,
                    })}
                  </p>
                ) : null}
              </TableCell>
              <TableCell>
                <span className='flex flex-wrap gap-1.5'>
                  {env.protected ? (
                    <Badge>{t('environments.protected')}</Badge>
                  ) : null}
                  {env.recordOnly ? (
                    <Badge variant='outline'>
                      {t('environments.recordOnly')}
                    </Badge>
                  ) : null}
                </span>
              </TableCell>
              <TableCell>
                {env.approvers.length > 0 ? env.approvers.join(', ') : '—'}
              </TableCell>
              <TableCell className='font-mono text-xs'>
                {env.publicUrlPattern ?? '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  return (
    <PageContainer>
      <PageHeader
        title={t('environments.title')}
        description={t('environments.description')}
        actions={
          canManage ? (
            <Link
              to='/release-environments'
              className={buttonVariants({ size: 'sm' })}
            >
              <PlusIcon data-icon='inline-start' />
              {t('environments.add')}
            </Link>
          ) : undefined
        }
      />
      {body}
    </PageContainer>
  );
}
