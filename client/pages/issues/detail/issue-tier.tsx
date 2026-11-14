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
import type { IssueTierName } from '#hooks/use-autopilot';
import { useIssueTier, useSetIssueTier } from '#hooks/use-issue-tier';

const TIERS: readonly IssueTierName[] = ['small', 'standard', 'sensitive'];

/** The issue's tier: how much care it asks for. Raised by sensitive paths, never lowered by itself (T10). */
export function IssueTierRow({
  issueId,
  canEdit,
}: {
  readonly issueId: string;
  readonly canEdit: boolean;
}): ReactElement | null {
  const { t } = useTranslation();
  const toaster = useToaster();
  const tier = useIssueTier(issueId);
  const set = useSetIssueTier(issueId);
  if (!tier.data) return null;
  return (
    <div className='flex flex-col gap-1'>
      <span className='text-sm text-muted-foreground'>{t('tier.label')}</span>
      <Select
        value={tier.data.tier}
        disabled={!canEdit}
        onValueChange={(value) =>
          set.mutate(value as IssueTierName, {
            onError: (error) =>
              toaster.show({
                type: 'error',
                title: t('tier.saveError'),
                description:
                  error instanceof Error ? error.message : String(error),
              }),
          })
        }
      >
        <SelectTrigger aria-label={t('tier.label')}>
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
      <span className='text-xs text-muted-foreground'>
        {tier.data.raisedFrom
          ? t('tier.raised', { from: t(`tier.names.${tier.data.raisedFrom}`) })
          : tier.data.source === 'default'
            ? t('tier.fromDefault')
            : t(`tier.hints.${tier.data.tier}`)}
      </span>
    </div>
  );
}
