import { useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { LoaderCircle, UploadIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import { Alert, AlertDescription, AlertTitle } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { ProjectSection } from '#extensions/nocobase-project-detail/project-detail';
import { useHarnessExport, useHarnessStatus } from '#hooks/use-harness-export';

/** Writes the rules Studio keeps for the project into its repository as a pull request, and says when the copy drifted (T4). */
export function ProjectHarnessExport({
  projectId,
  canManage,
}: {
  readonly projectId: string;
  readonly canManage: boolean;
}): ReactElement | null {
  const { t } = useTranslation();
  const toaster = useToaster();
  const status = useHarnessStatus(projectId, canManage);
  const exporter = useHarnessExport(projectId);
  if (!canManage) return null;
  const data = status.data;
  const run = (): void =>
    exporter.mutate(undefined, {
      onSuccess: (result) =>
        toaster.show({
          type: 'success',
          title: t('harnessExport.opened', { number: result.number }),
          description: result.url,
        }),
      onError: (error) =>
        toaster.show({
          type: 'error',
          title: t('harnessExport.failed'),
          description: error instanceof Error ? error.message : String(error),
        }),
    });
  return (
    <ProjectSection
      title={t('harnessExport.title')}
      description={t('harnessExport.description')}
    >
      <div className='flex flex-col gap-3'>
        {status.isPending ? (
          <div className='flex items-center gap-2 text-sm text-muted-foreground'>
            <LoaderCircle className='size-4 animate-spin' />
            {t('harnessExport.loading')}
          </div>
        ) : status.isError ? (
          <p className='text-sm text-destructive'>{t('harnessExport.error')}</p>
        ) : data ? (
          <>
            <p className='text-sm'>
              {t(`harnessExport.state.${data.state}`, {
                repository: data.repository ?? '',
                count: data.files,
              })}
            </p>
            {data.state === 'drifted' ? (
              <Alert>
                <AlertTitle>{t('harnessExport.drift.title')}</AlertTitle>
                <AlertDescription>
                  <ul className='list-disc pl-5'>
                    {data.edited.map((path) => (
                      <li key={path}>
                        {t('harnessExport.drift.edited', { path })}
                      </li>
                    ))}
                    {data.missing.map((path) => (
                      <li key={path}>
                        {t('harnessExport.drift.missing', { path })}
                      </li>
                    ))}
                    {data.outdated ? (
                      <li>{t('harnessExport.drift.outdated')}</li>
                    ) : null}
                  </ul>
                </AlertDescription>
              </Alert>
            ) : null}
          </>
        ) : null}
        <div>
          <Button
            size='sm'
            disabled={
              exporter.isPending ||
              !data ||
              data.state === 'noRepository' ||
              data.state === 'inSync'
            }
            onClick={run}
          >
            {exporter.isPending ? (
              <LoaderCircle className='animate-spin' />
            ) : (
              <UploadIcon />
            )}
            {t('harnessExport.action')}
          </Button>
        </div>
      </div>
    </ProjectSection>
  );
}
