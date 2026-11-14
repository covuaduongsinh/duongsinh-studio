import { useTranslation } from '@nocobase/i18n/client';
import { LoaderCircle } from 'lucide-react';
import type { ReactElement } from 'react';

import { Badge } from '#components/ui/badge';
import { ProjectSection } from '#extensions/nocobase-project-detail/project-detail';
import { useEffectiveConfig } from '#hooks/use-quota';

/** What is in force for the project and where each value comes from; read-only (plan T, T13). */
export function ProjectEffectiveConfig({
  projectId,
}: {
  readonly projectId: string;
}): ReactElement {
  const { t } = useTranslation();
  const config = useEffectiveConfig(projectId);
  return (
    <ProjectSection
      title={t('effectiveConfig.title')}
      description={t('effectiveConfig.description')}
    >
      {config.isPending ? (
        <div className='flex items-center gap-2 text-sm text-muted-foreground'>
          <LoaderCircle className='size-4 animate-spin' />
          {t('effectiveConfig.loading')}
        </div>
      ) : config.isError ? (
        <p className='text-sm text-destructive'>{t('effectiveConfig.error')}</p>
      ) : (
        <ul className='flex flex-col divide-y text-sm'>
          {config.data.map((row) => (
            <li
              key={row.key}
              className='flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between'
            >
              <span className='min-w-0'>
                {t(`effectiveConfig.keys.${row.key}`, {
                  defaultValue: row.key,
                })}
              </span>
              <span className='flex shrink-0 items-center gap-2'>
                <code className='break-all'>{row.value}</code>
                <Badge
                  variant={row.source === 'default' ? 'outline' : 'secondary'}
                >
                  {t(`effectiveConfig.source.${row.source}`)}
                </Badge>
              </span>
            </li>
          ))}
        </ul>
      )}
    </ProjectSection>
  );
}
