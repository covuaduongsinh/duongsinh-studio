import { useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { ProjectSection } from '#extensions/nocobase-project-detail/project-detail';
import {
  useProjectAutopilot,
  useUpdateProjectAutopilot,
  type IssueTierName,
} from '#hooks/use-autopilot';

const TIERS: readonly IssueTierName[] = ['small', 'standard', 'sensitive'];

/** The tier an issue has until someone chooses another (plan T, T10; `standard` unless changed). */
export function ProjectDefaultTier({
  projectId,
  canManage,
}: {
  readonly projectId: string;
  readonly canManage: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const toaster = useToaster();
  const settings = useProjectAutopilot(projectId);
  const update = useUpdateProjectAutopilot(projectId);
  return (
    <ProjectSection
      title={t('tier.project.title')}
      description={t('tier.project.description')}
    >
      <Select
        value={settings.data?.defaultTier ?? 'standard'}
        disabled={!canManage || !settings.data}
        onValueChange={(value) =>
          update.mutate(
            { defaultTier: value as IssueTierName },
            {
              onError: (error) =>
                toaster.show({
                  type: 'error',
                  title: t('tier.saveError'),
                  description:
                    error instanceof Error ? error.message : String(error),
                }),
            },
          )
        }
      >
        <SelectTrigger
          className='w-full sm:w-64'
          aria-label={t('tier.project.title')}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TIERS.map((name) => (
            <SelectItem key={name} value={name}>
              {t(`tier.names.${name}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <ul className='mt-3 flex flex-col gap-1 text-sm text-muted-foreground'>
        {TIERS.map((name) => (
          <li key={name}>
            <strong className='font-medium text-foreground'>
              {t(`tier.names.${name}`)}
            </strong>
            : {t(`tier.hints.${name}`)}
          </li>
        ))}
      </ul>
    </ProjectSection>
  );
}
