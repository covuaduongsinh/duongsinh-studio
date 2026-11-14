import { useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { LoaderCircle } from 'lucide-react';
import type { ReactElement } from 'react';

import { Badge } from '#components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { Switch } from '#components/ui/switch';
import { ProjectSection } from '#extensions/nocobase-project-detail/project-detail';
import {
  useProjectReactions,
  useUpdateProjectReaction,
  type ReactionRule,
} from '#hooks/use-reactions';

const ATTEMPTS = [1, 2, 3, 4, 5] as const;

function RuleRow({
  projectId,
  rule,
  canManage,
}: {
  readonly projectId: string;
  readonly rule: ReactionRule;
  readonly canManage: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const toaster = useToaster();
  const update = useUpdateProjectReaction(projectId);
  const change = (input: { enabled?: boolean; maxAttempts?: number }): void => {
    update.mutate(
      { event: rule.event, input },
      {
        onError: (error) =>
          toaster.show({
            type: 'error',
            title: t('reactions.toast.saveError'),
            description: error instanceof Error ? error.message : String(error),
          }),
      },
    );
  };
  return (
    <li className='flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between'>
      <div className='min-w-0'>
        <div className='flex flex-wrap items-center gap-2'>
          <span className='font-medium'>
            {t(`reactions.events.${rule.event}.title`)}
          </span>
          {rule.overridden ? (
            <Badge variant='secondary'>{t('reactions.overridden')}</Badge>
          ) : null}
        </div>
        <p className='text-sm text-muted-foreground'>
          {t(`reactions.events.${rule.event}.description`)}
        </p>
      </div>
      <div className='flex shrink-0 items-center gap-3'>
        <label className='flex items-center gap-2 text-sm'>
          <span className='text-muted-foreground'>
            {t('reactions.attempts')}
          </span>
          <Select
            value={String(rule.maxAttempts)}
            disabled={!canManage || !rule.enabled}
            onValueChange={(value) => change({ maxAttempts: Number(value) })}
          >
            <SelectTrigger
              className='w-16'
              aria-label={t('reactions.attemptsFor', {
                event: t(`reactions.events.${rule.event}.title`),
              })}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ATTEMPTS.map((count) => (
                <SelectItem key={count} value={String(count)}>
                  {count}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <Switch
          checked={rule.enabled}
          disabled={!canManage}
          aria-label={t('reactions.enabledFor', {
            event: t(`reactions.events.${rule.event}.title`),
          })}
          onCheckedChange={(enabled) => change({ enabled })}
        />
      </div>
    </li>
  );
}

/** What Studio does by itself when CI turns red, a branch conflicts, a review asks for changes or a run fails (T1.5). */
export function ProjectReactions({
  projectId,
  canManage,
}: {
  readonly projectId: string;
  readonly canManage: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const rules = useProjectReactions(projectId);
  return (
    <ProjectSection
      title={t('reactions.section.title')}
      description={t('reactions.section.description')}
    >
      {rules.isPending ? (
        <div className='flex items-center gap-2 py-4 text-sm text-muted-foreground'>
          <LoaderCircle className='size-4 animate-spin' />
          {t('reactions.loading')}
        </div>
      ) : rules.isError ? (
        <p className='py-4 text-sm text-destructive'>{t('reactions.error')}</p>
      ) : (
        <ul className='flex flex-col gap-3'>
          {rules.data.map((rule) => (
            <RuleRow
              key={rule.event}
              projectId={projectId}
              rule={rule}
              canManage={canManage}
            />
          ))}
          <li className='text-xs text-muted-foreground'>
            {t('reactions.limitNote')}
          </li>
        </ul>
      )}
    </ProjectSection>
  );
}
