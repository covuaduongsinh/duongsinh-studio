import { useToaster } from '@nocobase/app-client';
import {
  canManageProject,
  useProjectDetail,
} from '@nocobase/app-plugin-projects/client/projects';
import { useViewer } from '@nocobase/app-plugin-projects/client/kit';
import { useTranslation } from '@nocobase/i18n/client';
import {
  AlertTriangleIcon,
  BotIcon,
  CheckCircle2Icon,
  GitMergeIcon,
  LoaderCircle,
  PauseIcon,
  PlayIcon,
  SaveIcon,
  XCircleIcon,
} from 'lucide-react';
import { useState, type FormEvent, type ReactElement } from 'react';

import { Alert, AlertDescription, AlertTitle } from '#components/ui/alert';
import { Badge } from '#components/ui/badge';
import { Button } from '#components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import { Field, FieldLabel } from '#components/ui/field';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { Switch } from '#components/ui/switch';
import { Textarea } from '#components/ui/textarea';
import { ProjectSection } from '#extensions/nocobase-project-detail/project-detail';
import {
  usePauseProjectAutopilot,
  useProjectAutopilot,
  useProjectAutopilotEvents,
  useResumeProjectAutopilot,
  useUpdateProjectAutopilot,
  type AutopilotEvent,
  type AutopilotSettings,
  type AutopilotUpdateInput,
} from '#hooks/use-autopilot';

function formatEventKind(
  kind: AutopilotEvent['kind'],
  t: (key: string) => string,
): {
  label: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  icon: typeof BotIcon;
} {
  switch (kind) {
    case 'merged':
      return {
        label: t('autopilot.events.merged'),
        variant: 'default',
        icon: GitMergeIcon,
      };
    case 'opened':
      return {
        label: t('autopilot.events.opened'),
        variant: 'secondary',
        icon: CheckCircle2Icon,
      };
    case 'stalled':
      return {
        label: t('autopilot.events.stalled'),
        variant: 'outline',
        icon: AlertTriangleIcon,
      };
    case 'blocked':
      return {
        label: t('autopilot.events.blocked'),
        variant: 'destructive',
        icon: XCircleIcon,
      };
    case 'paused':
      return {
        label: t('autopilot.events.paused'),
        variant: 'outline',
        icon: PauseIcon,
      };
    case 'skipped':
    default:
      return {
        label: t('autopilot.events.skipped'),
        variant: 'outline',
        icon: BotIcon,
      };
  }
}

function ProjectAutopilotForm({
  projectId,
  settings,
  canManage,
  onPauseClick,
}: {
  readonly projectId: string;
  readonly settings: AutopilotSettings | undefined;
  readonly canManage: boolean;
  readonly onPauseClick: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const toaster = useToaster();
  const updateMutation = useUpdateProjectAutopilot(projectId);

  const [enabled, setEnabled] = useState(settings?.enabled ?? false);
  const [mergeMethod, setMergeMethod] = useState<'squash' | 'merge' | 'rebase'>(
    (settings?.mergeMethod as 'squash' | 'merge' | 'rebase') || 'squash',
  );
  const [maxActiveIssues, setMaxActiveIssues] = useState<string>(
    settings?.maxActiveIssues !== null &&
      settings?.maxActiveIssues !== undefined
      ? String(settings.maxActiveIssues)
      : '',
  );
  const [stallMinutes, setStallMinutes] = useState<number>(
    settings?.stallMinutes ?? 30,
  );
  const [sensitivePolicy, setSensitivePolicy] = useState<
    'extraReview' | 'human'
  >(settings?.sensitivePolicy ?? 'extraReview');
  const [sensitivePaths, setSensitivePaths] = useState<string>(
    (settings?.sensitivePaths ?? []).join('\n'),
  );

  const handleSaveSettings = (event: FormEvent): void => {
    event.preventDefault();
    const payload: AutopilotUpdateInput = {
      enabled,
      mergeMethod,
      maxActiveIssues: maxActiveIssues.trim()
        ? Number.parseInt(maxActiveIssues.trim(), 10)
        : null,
      stallMinutes: Number(stallMinutes) || 30,
      sensitivePolicy,
      sensitivePaths: sensitivePaths
        .split('\n')
        .map((p) => p.trim())
        .filter(Boolean),
    };

    updateMutation.mutate(payload, {
      onSuccess: () => {
        toaster.show({
          type: 'success',
          title: t('autopilot.toast.savedTitle'),
          description: t('autopilot.toast.savedDescription'),
        });
      },
      onError: (err) => {
        toaster.show({
          type: 'error',
          title: t('autopilot.toast.saveErrorTitle'),
          description: err instanceof Error ? err.message : String(err),
        });
      },
    });
  };

  return (
    <form
      onSubmit={handleSaveSettings}
      className='space-y-4 rounded-lg border p-4 bg-card'
    >
      <div className='flex items-center justify-between pb-2 border-b'>
        <div>
          <Label className='text-base font-medium'>
            {t('autopilot.fields.enableAutopilot')}
          </Label>
          <p className='text-xs text-muted-foreground'>
            {t('autopilot.fields.enableAutopilotHint')}
          </p>
        </div>
        <div className='flex items-center gap-3'>
          {settings?.enabled && !settings.pausedReason && canManage && (
            <Button
              type='button'
              size='sm'
              variant='outline'
              onClick={onPauseClick}
              className='text-amber-600 border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950'
            >
              <PauseIcon className='mr-1 size-3.5' />
              {t('autopilot.actions.pause')}
            </Button>
          )}
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
            disabled={!canManage || updateMutation.isPending}
          />
        </div>
      </div>

      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
        <Field>
          <FieldLabel>{t('autopilot.fields.mergeMethod')}</FieldLabel>
          <Select
            value={mergeMethod}
            onValueChange={(val) =>
              setMergeMethod(val as 'squash' | 'merge' | 'rebase')
            }
            disabled={!canManage}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='squash'>
                {t('autopilot.mergeMethods.squash')}
              </SelectItem>
              <SelectItem value='merge'>
                {t('autopilot.mergeMethods.merge')}
              </SelectItem>
              <SelectItem value='rebase'>
                {t('autopilot.mergeMethods.rebase')}
              </SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field>
          <FieldLabel>{t('autopilot.fields.maxActiveIssues')}</FieldLabel>
          <Input
            type='number'
            min={1}
            placeholder={t('autopilot.fields.maxActiveIssuesPlaceholder')}
            value={maxActiveIssues}
            onChange={(e) => setMaxActiveIssues(e.target.value)}
            disabled={!canManage}
          />
          <p className='text-xs text-muted-foreground mt-1'>
            {t('autopilot.fields.maxActiveIssuesHint')}
          </p>
        </Field>

        <Field>
          <FieldLabel>{t('autopilot.fields.stallMinutes')}</FieldLabel>
          <Input
            type='number'
            min={5}
            value={stallMinutes}
            onChange={(e) => setStallMinutes(Number(e.target.value))}
            disabled={!canManage}
          />
          <p className='text-xs text-muted-foreground mt-1'>
            {t('autopilot.fields.stallMinutesHint')}
          </p>
        </Field>

        <Field>
          <FieldLabel>{t('autopilot.fields.sensitivePolicy')}</FieldLabel>
          <Select
            value={sensitivePolicy}
            onValueChange={(val) =>
              setSensitivePolicy(val as 'extraReview' | 'human')
            }
            disabled={!canManage}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='extraReview'>
                {t('autopilot.sensitivePolicies.extraReview')}
              </SelectItem>
              <SelectItem value='human'>
                {t('autopilot.sensitivePolicies.human')}
              </SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Field>
        <FieldLabel>{t('autopilot.fields.sensitivePaths')}</FieldLabel>
        <Textarea
          rows={3}
          placeholder={'database/\nserver/security/\npackage.json'}
          value={sensitivePaths}
          onChange={(e) => setSensitivePaths(e.target.value)}
          disabled={!canManage}
          className='font-mono text-xs'
        />
        <p className='text-xs text-muted-foreground mt-1'>
          {t('autopilot.fields.sensitivePathsHint')}
        </p>
      </Field>

      {canManage && (
        <div className='flex justify-end pt-2'>
          <Button type='submit' disabled={updateMutation.isPending}>
            {updateMutation.isPending ? (
              <LoaderCircle className='mr-1.5 size-4 animate-spin' />
            ) : (
              <SaveIcon className='mr-1.5 size-4' />
            )}
            {t('autopilot.actions.save')}
          </Button>
        </div>
      )}
    </form>
  );
}

export function ProjectAutopilotBadge({
  projectId,
}: {
  readonly projectId: string;
}): ReactElement | null {
  const { t } = useTranslation();
  const { data: settings, isLoading } = useProjectAutopilot(projectId);

  if (isLoading || !settings) return null;

  if (!settings.enabled) {
    return (
      <Badge
        variant='outline'
        className='text-xs font-normal text-muted-foreground'
      >
        {t('autopilot.status.disabled')}
      </Badge>
    );
  }

  if (settings.pausedReason) {
    return (
      <Badge
        variant='outline'
        className='border-amber-500 bg-amber-50 text-xs font-normal text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
        title={settings.pausedReason}
      >
        <PauseIcon className='mr-1 size-3' />
        {t('autopilot.status.paused')}
      </Badge>
    );
  }

  return (
    <Badge
      variant='outline'
      className='border-emerald-500 bg-emerald-50 text-xs font-normal text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
    >
      <BotIcon className='mr-1 size-3' />
      {t('autopilot.status.active')}
    </Badge>
  );
}

export function ProjectAutopilot({
  projectId,
}: {
  readonly projectId: string;
}): ReactElement {
  const { t } = useTranslation();
  const toaster = useToaster();
  const viewer = useViewer();
  const projectDetail = useProjectDetail(projectId);
  const canManage = Boolean(
    projectDetail.data && canManageProject(viewer, projectDetail.data),
  );

  const { data: settings, isLoading } = useProjectAutopilot(projectId);
  const { data: events = [] } = useProjectAutopilotEvents(projectId);
  const pauseMutation = usePauseProjectAutopilot(projectId);
  const resumeMutation = useResumeProjectAutopilot(projectId);

  const [pauseDialogOpen, setPauseDialogOpen] = useState(false);
  const [pauseReason, setPauseReason] = useState('');

  const handlePause = (): void => {
    if (!pauseReason.trim()) return;
    pauseMutation.mutate(
      { reason: pauseReason.trim() },
      {
        onSuccess: () => {
          setPauseDialogOpen(false);
          setPauseReason('');
          toaster.show({
            type: 'success',
            title: t('autopilot.toast.pausedTitle'),
            description: t('autopilot.toast.pausedDescription'),
          });
        },
        onError: (err) => {
          toaster.show({
            type: 'error',
            title: t('autopilot.toast.pauseErrorTitle'),
            description: err instanceof Error ? err.message : String(err),
          });
        },
      },
    );
  };

  const handleResume = (): void => {
    resumeMutation.mutate(undefined, {
      onSuccess: () => {
        toaster.show({
          type: 'success',
          title: t('autopilot.toast.resumedTitle'),
          description: t('autopilot.toast.resumedDescription'),
        });
      },
      onError: (err) => {
        toaster.show({
          type: 'error',
          title: t('autopilot.toast.resumeErrorTitle'),
          description: err instanceof Error ? err.message : String(err),
        });
      },
    });
  };

  if (isLoading) {
    return (
      <ProjectSection
        title={t('autopilot.section.title')}
        description={t('autopilot.section.description')}
      >
        <div className='flex items-center gap-2 py-4 text-sm text-muted-foreground'>
          <LoaderCircle className='size-4 animate-spin' />
          {t('autopilot.loading')}
        </div>
      </ProjectSection>
    );
  }

  return (
    <ProjectSection
      title={t('autopilot.section.title')}
      description={t('autopilot.section.description')}
    >
      <div className='space-y-6'>
        {settings?.pausedReason ? (
          <Alert
            variant='destructive'
            className='border-amber-500 bg-amber-50/80 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200'
          >
            <AlertTriangleIcon className='size-4 text-amber-600 dark:text-amber-400' />
            <AlertTitle className='font-semibold'>
              {t('autopilot.pausedAlert.title')}
            </AlertTitle>
            <AlertDescription className='mt-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
              <span>
                {t('autopilot.pausedAlert.reason')}:{' '}
                <strong>{settings.pausedReason}</strong>
              </span>
              {canManage && (
                <Button
                  size='sm'
                  variant='outline'
                  onClick={handleResume}
                  disabled={resumeMutation.isPending}
                  className='shrink-0 border-amber-600 bg-white hover:bg-amber-100 dark:bg-amber-950 dark:hover:bg-amber-900'
                >
                  <PlayIcon className='mr-1.5 size-3.5' />
                  {t('autopilot.actions.resume')}
                </Button>
              )}
            </AlertDescription>
          </Alert>
        ) : null}

        <ProjectAutopilotForm
          key={settings?.updatedAt ?? 'init'}
          projectId={projectId}
          settings={settings}
          canManage={canManage}
          onPauseClick={() => setPauseDialogOpen(true)}
        />

        {/* Recent Events Log */}
        <div className='space-y-2'>
          <h4 className='text-sm font-semibold tracking-tight text-foreground'>
            {t('autopilot.events.title')}
          </h4>
          {events.length === 0 ? (
            <p className='text-xs text-muted-foreground py-2'>
              {t('autopilot.events.empty')}
            </p>
          ) : (
            <div className='divide-y rounded-md border text-xs'>
              {events.map((event) => {
                const badge = formatEventKind(event.kind, t);
                const Icon = badge.icon;
                const time = new Date(event.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  month: 'short',
                  day: 'numeric',
                });
                return (
                  <div
                    key={event.id}
                    className='flex items-start gap-2.5 p-2.5 hover:bg-muted/30'
                  >
                    <Badge
                      variant={badge.variant}
                      className='shrink-0 text-[10px] uppercase font-mono'
                    >
                      <Icon className='mr-1 size-3' />
                      {badge.label}
                    </Badge>
                    <div className='min-w-0 flex-1 space-y-0.5'>
                      <div className='flex items-center justify-between gap-2'>
                        <span className='font-medium text-foreground truncate'>
                          {event.issueId
                            ? `Issue #${event.issueId.slice(-6)}`
                            : 'Project'}
                          {event.pullRequestId
                            ? ` • PR #${event.pullRequestId.slice(-4)}`
                            : ''}
                        </span>
                        <span className='shrink-0 text-muted-foreground'>
                          {time}
                        </span>
                      </div>
                      {event.reason && (
                        <p className='text-muted-foreground break-words'>
                          {event.reason}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Pause Confirmation Dialog */}
      <Dialog open={pauseDialogOpen} onOpenChange={setPauseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('autopilot.pauseDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('autopilot.pauseDialog.description')}
            </DialogDescription>
          </DialogHeader>
          <div className='py-2'>
            <Field>
              <FieldLabel>{t('autopilot.pauseDialog.reasonLabel')}</FieldLabel>
              <Input
                placeholder={t('autopilot.pauseDialog.reasonPlaceholder')}
                value={pauseReason}
                onChange={(e) => setPauseReason(e.target.value)}
                autoFocus
              />
            </Field>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant='outline' />}>
              {t('common.cancel')}
            </DialogClose>
            <Button
              variant='destructive'
              onClick={handlePause}
              disabled={!pauseReason.trim() || pauseMutation.isPending}
            >
              {pauseMutation.isPending && (
                <LoaderCircle className='mr-1.5 size-4 animate-spin' />
              )}
              {t('autopilot.actions.pause')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ProjectSection>
  );
}
