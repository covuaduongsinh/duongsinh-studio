import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useMutation } from '@tanstack/react-query';
import { LoaderCircle, MonitorSmartphoneIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import { Button } from '#components/ui/button';
import { ProjectSection } from '#extensions/nocobase-project-detail/project-detail';

/** Proposes the `ds-ui-smoke` workflow to the project's repository as a pull request (plan T, T5). */
export function ProjectUiSmoke({
  projectId,
  canManage,
}: {
  readonly projectId: string;
  readonly canManage: boolean;
}): ReactElement | null {
  const { t } = useTranslation();
  const toaster = useToaster();
  const api = useApiClient();
  const propose = useMutation({
    mutationFn: async () =>
      (
        await api.request<{
          data: { pullRequest: { number: number; url: string } };
        }>({
          path: `projects/${projectId}/uiSmoke`,
          method: 'POST',
          json: {},
        })
      ).data,
  });
  if (!canManage) return null;
  return (
    <ProjectSection
      title={t('uiSmoke.title')}
      description={t('uiSmoke.description')}
    >
      <div className='flex flex-col gap-3'>
        <ul className='flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground'>
          <li>{t('uiSmoke.points.actions')}</li>
          <li>{t('uiSmoke.points.sizes')}</li>
          <li>{t('uiSmoke.points.pages')}</li>
        </ul>
        <div>
          <Button
            size='sm'
            disabled={propose.isPending}
            onClick={() =>
              propose.mutate(undefined, {
                onSuccess: (result) =>
                  toaster.show({
                    type: 'success',
                    title: t('uiSmoke.opened', {
                      number: result.pullRequest.number,
                    }),
                    description: result.pullRequest.url,
                  }),
                onError: (error) =>
                  toaster.show({
                    type: 'error',
                    title: t('uiSmoke.failed'),
                    description:
                      error instanceof Error ? error.message : String(error),
                  }),
              })
            }
          >
            {propose.isPending ? (
              <LoaderCircle className='animate-spin' />
            ) : (
              <MonitorSmartphoneIcon />
            )}
            {t('uiSmoke.action')}
          </Button>
        </div>
        <p className='text-xs text-muted-foreground'>
          {t('uiSmoke.ownerNote')}
        </p>
      </div>
    </ProjectSection>
  );
}
