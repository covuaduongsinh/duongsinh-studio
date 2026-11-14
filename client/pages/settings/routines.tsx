/** Settings → Routines: work that comes back on a schedule, off until someone turns it on (plan T, T6). */
import { useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { LoaderCircle, PlayIcon, Trash2Icon } from 'lucide-react';
import { useState, type FormEvent, type ReactElement } from 'react';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Badge } from '#components/ui/badge';
import { Button } from '#components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '#components/ui/card';
import { Checkbox } from '#components/ui/checkbox';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import { Skeleton } from '#components/ui/skeleton';
import { Switch } from '#components/ui/switch';
import { Textarea } from '#components/ui/textarea';
import {
  useCreateRoutine,
  useCreateRoutineFromTemplate,
  useDeleteRoutine,
  useRoutineProjects,
  useRoutines,
  useRoutineTemplates,
  useRunRoutine,
  useSetRoutineEnabled,
  type Routine,
} from '#hooks/use-routines';

function ProjectPicker({
  selected,
  onChange,
}: {
  readonly selected: string[];
  readonly onChange: (ids: string[]) => void;
}): ReactElement {
  const { t } = useTranslation();
  const projects = useRoutineProjects();
  return (
    <fieldset className='flex flex-col gap-2'>
      <legend className='text-sm font-medium'>{t('routines.projects')}</legend>
      {projects.data?.map((project) => (
        <label key={project.id} className='flex items-center gap-2 text-sm'>
          <Checkbox
            checked={selected.includes(project.id)}
            onCheckedChange={(on) =>
              onChange(
                on
                  ? [...selected, project.id]
                  : selected.filter((id) => id !== project.id),
              )
            }
          />
          {project.name}
        </label>
      ))}
    </fieldset>
  );
}

function NewRoutine(): ReactElement {
  const { t } = useTranslation();
  const toaster = useToaster();
  const create = useCreateRoutine();
  const [name, setName] = useState('');
  const [template, setTemplate] = useState('');
  const [cron, setCron] = useState('0 8 * * 1');
  const [playbook, setPlaybook] = useState('');
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    create.mutate(
      {
        name: name.trim(),
        template: template.trim(),
        cron: cron.trim(),
        playbookSlug: playbook.trim() === '' ? null : playbook.trim(),
        projectIds,
      },
      {
        onSuccess: () => {
          setName('');
          setTemplate('');
          setProjectIds([]);
        },
        onError: (error) =>
          toaster.show({
            type: 'error',
            title: t('routines.createFailed'),
            description: error instanceof Error ? error.message : String(error),
          }),
      },
    );
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('routines.new')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form className='flex flex-col gap-4' onSubmit={submit}>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='routine-name'>{t('routines.name')}</Label>
            <Input
              id='routine-name'
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='routine-template'>{t('routines.template')}</Label>
            <Textarea
              id='routine-template'
              rows={4}
              value={template}
              onChange={(event) => setTemplate(event.target.value)}
            />
          </div>
          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='flex flex-col gap-2'>
              <Label htmlFor='routine-cron'>{t('routines.cron')}</Label>
              <Input
                id='routine-cron'
                value={cron}
                onChange={(event) => setCron(event.target.value)}
              />
              <span className='text-xs text-muted-foreground'>
                {t('routines.cronHint')}
              </span>
            </div>
            <div className='flex flex-col gap-2'>
              <Label htmlFor='routine-playbook'>{t('routines.playbook')}</Label>
              <Input
                id='routine-playbook'
                value={playbook}
                placeholder='nang-template'
                onChange={(event) => setPlaybook(event.target.value)}
              />
            </div>
          </div>
          <ProjectPicker selected={projectIds} onChange={setProjectIds} />
          <div>
            <Button
              type='submit'
              disabled={
                create.isPending ||
                name.trim() === '' ||
                template.trim() === '' ||
                projectIds.length === 0
              }
            >
              {t('routines.create')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function Templates(): ReactElement | null {
  const { t } = useTranslation();
  const toaster = useToaster();
  const templates = useRoutineTemplates();
  const projects = useRoutineProjects();
  const make = useCreateRoutineFromTemplate();
  const [projectIds, setProjectIds] = useState<string[]>([]);
  if (!templates.data) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('routines.templates.title')}</CardTitle>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        <p className='text-sm text-muted-foreground'>
          {t('routines.templates.description')}
        </p>
        <ProjectPicker selected={projectIds} onChange={setProjectIds} />
        <ul className='flex flex-col gap-2'>
          {templates.data.map((template) => (
            <li
              key={template.key}
              className='flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between'
            >
              <span className='min-w-0'>
                <span className='block font-medium'>{template.name}</span>
                <span className='block text-sm text-muted-foreground'>
                  <code>{template.cron}</code> · {template.template}
                </span>
              </span>
              <Button
                variant='outline'
                size='sm'
                disabled={
                  make.isPending || projectIds.length === 0 || !projects.data
                }
                onClick={() =>
                  make.mutate(
                    { key: template.key, projectIds },
                    {
                      onError: (error) =>
                        toaster.show({
                          type: 'error',
                          title: t('routines.createFailed'),
                          description:
                            error instanceof Error
                              ? error.message
                              : String(error),
                        }),
                    },
                  )
                }
              >
                {t('routines.templates.add')}
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function RoutineRow({ routine }: { readonly routine: Routine }): ReactElement {
  const { t, i18n } = useTranslation();
  const toaster = useToaster();
  const projects = useRoutineProjects();
  const toggle = useSetRoutineEnabled();
  const run = useRunRoutine();
  const remove = useDeleteRoutine();
  const nameOf = (id: string): string =>
    projects.data?.find((project) => project.id === id)?.name ?? id;
  return (
    <li className='flex flex-col gap-3 rounded-lg border p-4'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div className='min-w-0'>
          <div className='flex flex-wrap items-center gap-2'>
            <span className='font-medium'>{routine.name}</span>
            <Badge variant={routine.enabled ? 'default' : 'outline'}>
              {routine.enabled ? t('routines.on') : t('routines.off')}
            </Badge>
          </div>
          <p className='text-sm text-muted-foreground'>
            <code>{routine.cron}</code> ·{' '}
            {routine.projectIds.map(nameOf).join(', ')}
            {routine.playbookSlug ? ` · !${routine.playbookSlug}` : ''}
          </p>
        </div>
        <Switch
          checked={routine.enabled}
          aria-label={t('routines.turnOn', { name: routine.name })}
          disabled={toggle.isPending}
          onCheckedChange={(enabled) =>
            toggle.mutate({ id: routine.id, enabled })
          }
        />
      </div>
      {routine.lastRunAt ? (
        <p className='text-xs text-muted-foreground'>
          {t('routines.last', {
            time: new Date(routine.lastRunAt).toLocaleString(i18n.language),
            result: routine.lastResult ?? '',
          })}
        </p>
      ) : null}
      <div className='flex flex-wrap gap-2'>
        <Button
          variant='outline'
          size='sm'
          disabled={run.isPending}
          onClick={() =>
            run.mutate(routine.id, {
              onSuccess: (result) =>
                toaster.show({
                  type: 'success',
                  title: t('routines.ran', {
                    created: result.created.length,
                    skipped: result.skipped.length,
                  }),
                }),
              onError: (error) =>
                toaster.show({
                  type: 'error',
                  title: t('routines.runFailed'),
                  description:
                    error instanceof Error ? error.message : String(error),
                }),
            })
          }
        >
          {run.isPending ? (
            <LoaderCircle className='animate-spin' />
          ) : (
            <PlayIcon />
          )}
          {t('routines.runNow')}
        </Button>
        <Button
          variant='outline'
          size='sm'
          disabled={remove.isPending}
          onClick={() => remove.mutate(routine.id)}
        >
          <Trash2Icon />
          {t('routines.delete')}
        </Button>
      </div>
    </li>
  );
}

export default function RoutinesPage(): ReactElement {
  const { t } = useTranslation();
  const routines = useRoutines();
  return (
    <PageContainer>
      <PageHeader
        title={t('routines.title')}
        description={t('routines.description')}
      />
      <div className='flex flex-col gap-6'>
        {routines.isPending ? (
          <Skeleton
            className='h-24 w-full'
            aria-label={t('routines.loading')}
          />
        ) : routines.isError ? (
          <p className='text-sm text-destructive'>{t('routines.error')}</p>
        ) : routines.data.length === 0 ? (
          <p className='text-sm text-muted-foreground'>{t('routines.empty')}</p>
        ) : (
          <ul className='flex flex-col gap-3'>
            {routines.data.map((routine) => (
              <RoutineRow key={routine.id} routine={routine} />
            ))}
          </ul>
        )}
        <Templates />
        <NewRoutine />
      </div>
    </PageContainer>
  );
}
