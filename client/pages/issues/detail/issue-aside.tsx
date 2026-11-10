/**
 * The side column of an issue's page: its properties, edited in place through the projects plugin's `useIssueUpdate`,
 * who follows it, and when it was created and changed.
 */
import {
  canChangeIssueOwner,
  canCloseIssue,
  canEditIssues,
  isClosing,
  useExecutorOptions,
  type IssuePageActions,
  type IssueUpdate,
} from '@nocobase/app-plugin-projects/client/issues';
import {
  canUseSetting,
  usePlanLookup,
  useViewer,
} from '@nocobase/app-plugin-projects/client/kit';
import { PRIORITIES } from '@nocobase/app-plugin-projects/shared/common';
import type { IssueDetail } from '@nocobase/app-plugin-projects/shared/issues';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import {
  AgentIcon,
  PersonValue,
  PropertyCard,
  PropertyDate,
  PropertyMultiSelect,
  PropertyRow,
  PropertySelect,
  type PropertyOption,
} from '#components/property-fields';
import { Checkbox } from '#components/ui/checkbox';
import {
  IssueDates,
  IssueFollowers,
} from '#extensions/nocobase-issue-detail/issue-properties';
import {
  useIssueAutopilotFlag,
  useSetIssueAutopilotFlag,
} from '#hooks/use-autopilot';

import {
  useIssueDetailLabels,
  usePropertyFieldLabels,
  useStatusPresenter,
} from '../presentation.js';

/** `options` with `current` added when it is not among them, so the select still names the value it shows. */
function withCurrent(
  options: readonly PropertyOption[],
  current: string | null,
  label: string | null | undefined,
): PropertyOption[] {
  if (current === null || options.some((option) => option.value === current))
    return [...options];
  return [...options, { value: current, label: label ?? current }];
}

const executorValue = (executor: {
  readonly type: string;
  readonly id: string;
}) => `${executor.type}:${executor.id}`;

function IssueAutopilotSection({
  issueId,
  canEdit,
}: {
  readonly issueId: string;
  readonly canEdit: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const { data: flag, isLoading } = useIssueAutopilotFlag(issueId);
  const setFlag = useSetIssueAutopilotFlag(issueId);

  const allowAutoStart = flag?.allowAutoStart ?? true;
  const inheritFromParent = flag?.inheritFromParent ?? true;
  const autoCompleteOnMerge = flag?.autoCompleteOnMerge ?? false;

  return (
    <div className='rounded-lg border bg-card p-3 text-card-foreground shadow-xs space-y-3'>
      <span className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
        {t('autopilot.issueSection.title')}
      </span>
      <div className='space-y-2.5 text-xs'>
        <label className='flex items-center gap-2 cursor-pointer select-none'>
          <Checkbox
            checked={allowAutoStart}
            onCheckedChange={(checked) => {
              setFlag.mutate({ allowAutoStart: Boolean(checked) });
            }}
            disabled={!canEdit || isLoading || setFlag.isPending}
          />
          <span className='font-medium text-foreground'>
            {t('autopilot.issueSection.allowAutoStart')}
          </span>
        </label>
        <label className='flex items-center gap-2 cursor-pointer select-none'>
          <Checkbox
            checked={inheritFromParent}
            onCheckedChange={(checked) => {
              setFlag.mutate({ inheritFromParent: Boolean(checked) });
            }}
            disabled={!canEdit || isLoading || setFlag.isPending}
          />
          <span className='text-muted-foreground'>
            {t('autopilot.issueSection.inheritFromParent')}
          </span>
        </label>
        <label className='flex items-center gap-2 cursor-pointer select-none'>
          <Checkbox
            checked={autoCompleteOnMerge}
            onCheckedChange={(checked) => {
              setFlag.mutate({ autoCompleteOnMerge: Boolean(checked) });
            }}
            disabled={!canEdit || isLoading || setFlag.isPending}
          />
          <span className='text-muted-foreground'>
            {t('autopilot.issueSection.autoCompleteOnMerge')}
          </span>
        </label>
      </div>
    </div>
  );
}

export function IssueAside({
  detail,
  update,
  actions,
}: {
  readonly detail: IssueDetail;
  readonly update: IssueUpdate;
  readonly actions: IssuePageActions;
}): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const viewer = useViewer();
  const lookup = usePlanLookup();
  const canEdit = canEditIssues(viewer);
  const others = useExecutorOptions(canEdit);
  const status = useStatusPresenter();
  const labels = useIssueDetailLabels();
  const fieldLabels = usePropertyFieldLabels();
  const apply = update.mutate;
  const mayClose = canCloseIssue(viewer, detail);
  const mayChangeOwner = canEdit && canChangeIssueOwner(viewer, detail);
  const mayCreateLabels = canUseSetting(viewer, 'pm.labels', 'update');

  const members = lookup.members.map((member) => ({
    value: member.userId,
    label: member.name,
  }));
  // The issue's own labels stay offered while the shared list is still loading.
  const labelOptions = [
    ...lookup.labels,
    ...detail.labels.filter(
      (label) => !lookup.labels.some((entry) => entry.id === label.id),
    ),
  ].map((label) => ({ value: label.id, label: label.name }));
  const executorOptions = withCurrent(
    [
      ...others.map((option) => ({
        value: executorValue(option),
        label: option.name,
        icon: <AgentIcon />,
        ...(option.note ? { note: option.note } : {}),
        ...(option.disabled ? { disabled: true } : {}),
      })),
      ...lookup.members.map((member) => ({
        value: executorValue({ type: 'user', id: member.userId }),
        label: member.name,
      })),
    ],
    detail.executor ? executorValue(detail.executor) : null,
    detail.executorName,
  );

  return (
    <div className='flex flex-col gap-4'>
      <PropertyCard
        title={t('issueDetail.properties')}
        busy={update.isPending}
        labels={fieldLabels}
      >
        <PropertyRow label={t('issueDetail.status')} htmlFor='issue-status'>
          <PropertySelect
            id='issue-status'
            disabled={!canEdit}
            options={detail.statuses.map((entry) => ({
              value: entry.key,
              label: status(entry.key, detail.statuses).name,
              disabled: !mayClose && isClosing(entry.category),
            }))}
            value={detail.statusKey}
            onChange={(value) => {
              if (value) apply({ statusKey: value });
            }}
          />
        </PropertyRow>
        <PropertyRow label={t('issueDetail.priority')} htmlFor='issue-priority'>
          <PropertySelect
            id='issue-priority'
            disabled={!canEdit}
            options={PRIORITIES.map((priority) => ({
              value: priority,
              label: t(`issues.priority.${priority}`),
            }))}
            value={detail.priority}
            onChange={(value) => {
              const priority = PRIORITIES.find((entry) => entry === value);
              if (priority) apply({ priority });
            }}
          />
        </PropertyRow>
        <PropertyRow label={t('issueDetail.owner')} htmlFor='issue-owner'>
          <PropertySelect
            id='issue-owner'
            disabled={!mayChangeOwner}
            options={withCurrent(
              members,
              detail.ownerUserId,
              detail.owner?.name,
            )}
            value={detail.ownerUserId}
            renderValue={(value) => (
              <PersonValue
                name={
                  members.find((member) => member.value === value)?.label ??
                  detail.owner?.name ??
                  value
                }
              />
            )}
            onChange={(value) => {
              if (value) apply({ ownerUserId: value });
            }}
          />
        </PropertyRow>
        <PropertyRow label={t('issueDetail.executor')} htmlFor='issue-executor'>
          <PropertySelect
            id='issue-executor'
            disabled={!canEdit}
            noneLabel={t('issueDetail.nobody')}
            options={executorOptions}
            value={detail.executor ? executorValue(detail.executor) : null}
            renderValue={(value) => (
              <PersonValue
                name={
                  executorOptions.find((option) => option.value === value)
                    ?.label ?? value
                }
                agent={!value.startsWith('user:')}
              />
            )}
            onChange={(value) => {
              if (value === null) {
                apply({ executor: null });
                return;
              }
              const split = value.indexOf(':');
              apply({
                executor: {
                  type: value.slice(0, split),
                  id: value.slice(split + 1),
                },
              });
            }}
          />
        </PropertyRow>
        <PropertyRow label={t('issueDetail.labels')} htmlFor='issue-labels'>
          <PropertyMultiSelect
            id='issue-labels'
            disabled={!canEdit}
            options={labelOptions}
            value={detail.labels.map((label) => label.id)}
            labels={fieldLabels}
            {...(mayCreateLabels ? { onCreate: actions.createLabel } : {})}
            onChange={(labelIds) => apply({ labelIds })}
          />
        </PropertyRow>
        <PropertyRow label={t('issueDetail.project')} htmlFor='issue-project'>
          <PropertySelect
            id='issue-project'
            disabled={!canEdit}
            noneLabel={t('issueDetail.noProject')}
            options={withCurrent(
              lookup.projects.map((project) => ({
                value: project.id,
                label: project.name,
              })),
              detail.projectId,
              detail.project?.name,
            )}
            value={detail.projectId}
            onChange={(projectId) => apply({ projectId })}
          />
        </PropertyRow>
        <PropertyRow label={t('issueDetail.startDate')} htmlFor='issue-start'>
          <PropertyDate
            id='issue-start'
            disabled={!canEdit}
            value={detail.startDate?.slice(0, 10) ?? null}
            clearLabel={t('issueDetail.clearStart')}
            onChange={(startDate) => apply({ startDate })}
          />
        </PropertyRow>
        <PropertyRow label={t('issueDetail.dueDate')} htmlFor='issue-due'>
          <PropertyDate
            id='issue-due'
            disabled={!canEdit}
            value={detail.dueDate?.slice(0, 10) ?? null}
            clearLabel={t('issueDetail.clearDue')}
            onChange={(dueDate) => apply({ dueDate })}
          />
        </PropertyRow>
      </PropertyCard>
      <IssueAutopilotSection issueId={detail.id} canEdit={canEdit} />
      <IssueFollowers
        followers={detail.subscribers.map((subscriber) => ({
          id: subscriber.userId,
          name: subscriber.name,
          reason: t(`issueDetail.followReason.${subscriber.reason}`),
        }))}
        following={detail.subscribers.some(
          (subscriber) => subscriber.userId === viewer?.userId,
        )}
        {...(viewer ? { onToggle: actions.setFollowing } : {})}
        labels={labels}
      />
      <IssueDates
        createdAt={detail.createdAt}
        updatedAt={detail.updatedAt}
        locale={locale}
        labels={labels}
      />
    </div>
  );
}
