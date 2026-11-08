/** Settings → Lead Agent: who the project manager runs as, how long it waits for them, and how it works. */
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type FormEvent, type ReactElement } from 'react';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '#components/ui/card';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { Skeleton } from '#components/ui/skeleton';
import { Switch } from '#components/ui/switch';
import { Textarea } from '#components/ui/textarea';
import {
  useProjectManager,
  useProjectManagerAgentOptions,
  useSaveProjectManager,
  type AgentOption,
  type ProjectManager,
} from '#hooks/use-project-manager';

/** The "no agent" choice of a select, which cannot hold null. */
const NONE = '__none__';

const label = (agent: AgentOption): string =>
  [agent.name, agent.model].filter(Boolean).join(' · ');

function AgentSelect({
  id,
  value,
  options,
  disabled,
  onChange,
}: {
  readonly id: string;
  readonly value: string | null;
  readonly options: readonly AgentOption[];
  readonly disabled: boolean;
  readonly onChange: (value: string | null) => void;
}): ReactElement {
  const { t } = useTranslation();
  const items = [
    { value: NONE, label: t('projectManager.noAgent') },
    ...options.map((agent) => ({ value: agent.id, label: label(agent) })),
  ];
  return (
    <Select
      value={value ?? NONE}
      items={items}
      disabled={disabled}
      onValueChange={(next) => onChange(!next || next === NONE ? null : next)}
    >
      <SelectTrigger id={id}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function NumberField({
  id,
  title,
  hint,
  value,
  min,
  disabled,
  onChange,
}: {
  readonly id: string;
  readonly title: string;
  readonly hint: string;
  readonly value: string;
  readonly min: number;
  readonly disabled: boolean;
  readonly onChange: (value: string) => void;
}): ReactElement {
  return (
    <div className='grid gap-2'>
      <Label htmlFor={id}>{title}</Label>
      <Input
        id={id}
        type='number'
        min={min}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
      <p className='text-sm text-muted-foreground'>{hint}</p>
    </div>
  );
}

function ProjectManagerForm({
  settings,
  options,
  canManage,
}: {
  readonly settings: ProjectManager;
  readonly options: readonly AgentOption[];
  readonly canManage: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const save = useSaveProjectManager();
  const [name, setName] = useState(settings.name);
  const [description, setDescription] = useState(settings.description ?? '');
  const [first, setFirst] = useState(settings.firstChoiceAgentId);
  const [fallback, setFallback] = useState(settings.fallbackAgentId);
  const [wait, setWait] = useState(String(settings.fallbackAfterSeconds));
  const [limit, setLimit] = useState(String(settings.commentRunLimit));
  const [builtIn, setBuiltIn] = useState(settings.principles === null);
  const [principles, setPrinciples] = useState(
    settings.principles ?? settings.builtInPrinciples,
  );

  const count = (text: string): number | null => {
    const number = Number(text);
    return text.trim() !== '' && Number.isInteger(number) && number >= 0
      ? number
      : null;
  };
  const waitSeconds = count(wait);
  const limitRuns = count(limit);
  const valid =
    name.trim() !== '' &&
    waitSeconds !== null &&
    limitRuns !== null &&
    limitRuns >= 1;

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (!canManage || !valid) return;
    save.mutate({
      name: name.trim(),
      description: description.trim() === '' ? null : description.trim(),
      firstChoiceAgentId: first,
      fallbackAgentId: fallback,
      fallbackAfterSeconds: waitSeconds,
      commentRunLimit: limitRuns,
      principles: builtIn ? null : principles,
    });
  };

  // `delegationQueueTimeoutSeconds` is stored by the server but nothing reads it yet, so it is not offered here.
  // Restores the numbers and the principles; the name, description and chosen agents are the team's own choices.
  const restore = (): void => {
    const { defaults } = settings;
    setWait(String(defaults.fallbackAfterSeconds));
    setLimit(String(defaults.commentRunLimit));
    setBuiltIn(true);
    setPrinciples(settings.builtInPrinciples);
    save.mutate({
      fallbackAfterSeconds: defaults.fallbackAfterSeconds,
      commentRunLimit: defaults.commentRunLimit,
      principles: null,
    });
  };

  return (
    <form className='grid gap-6' onSubmit={submit}>
      <Card>
        <CardHeader>
          <CardTitle>{t('projectManager.modelsTitle')}</CardTitle>
        </CardHeader>
        <CardContent className='grid gap-4 sm:grid-cols-2'>
          <div className='grid gap-2'>
            <Label htmlFor='pm-first'>{t('projectManager.firstChoice')}</Label>
            <AgentSelect
              id='pm-first'
              value={first}
              options={options}
              disabled={!canManage}
              onChange={setFirst}
            />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='pm-fallback'>{t('projectManager.fallback')}</Label>
            <AgentSelect
              id='pm-fallback'
              value={fallback}
              options={options}
              disabled={!canManage}
              onChange={setFallback}
            />
          </div>
          <p className='text-sm text-muted-foreground sm:col-span-2'>
            {t('projectManager.modelsHint')}
          </p>
          <NumberField
            id='pm-wait'
            title={t('projectManager.fallbackAfter')}
            hint={t('projectManager.fallbackAfterHint')}
            value={wait}
            min={0}
            disabled={!canManage}
            onChange={setWait}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('projectManager.workTitle')}</CardTitle>
        </CardHeader>
        <CardContent className='grid gap-4'>
          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='grid gap-2'>
              <Label htmlFor='pm-name'>{t('projectManager.name')}</Label>
              <Input
                id='pm-name'
                value={name}
                disabled={!canManage}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <NumberField
              id='pm-limit'
              title={t('projectManager.commentRunLimit')}
              hint={t('projectManager.commentRunLimitHint')}
              value={limit}
              min={1}
              disabled={!canManage}
              onChange={setLimit}
            />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='pm-description'>
              {t('projectManager.descriptionLabel')}
            </Label>
            <Textarea
              id='pm-description'
              rows={2}
              value={description}
              disabled={!canManage}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div className='flex items-center gap-2'>
            <Switch
              id='pm-built-in'
              checked={builtIn}
              disabled={!canManage}
              onCheckedChange={setBuiltIn}
            />
            <Label htmlFor='pm-built-in'>
              {t('projectManager.useBuiltIn')}
            </Label>
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='pm-principles'>
              {t('projectManager.principles')}
            </Label>
            <Textarea
              id='pm-principles'
              rows={10}
              value={builtIn ? settings.builtInPrinciples : principles}
              disabled={!canManage || builtIn}
              onChange={(event) => setPrinciples(event.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {save.isError ? (
        <Alert variant='destructive'>
          <AlertDescription>{save.error.message}</AlertDescription>
        </Alert>
      ) : null}
      {save.isSuccess ? (
        <Alert>
          <AlertDescription>{t('projectManager.saved')}</AlertDescription>
        </Alert>
      ) : null}
      {canManage ? (
        <div className='flex flex-wrap gap-2'>
          <Button type='submit' disabled={!valid || save.isPending}>
            {t('projectManager.save')}
          </Button>
          <Button
            type='button'
            variant='outline'
            disabled={save.isPending}
            onClick={restore}
          >
            {t('projectManager.restore')}
          </Button>
        </div>
      ) : (
        <p className='text-sm text-muted-foreground'>
          {t('projectManager.readOnly')}
        </p>
      )}
    </form>
  );
}

export default function ProjectManagerPage(): ReactElement {
  const { t } = useTranslation();
  const settings = useProjectManager();
  const options = useProjectManagerAgentOptions();
  const { can: canManage } = useCan({
    resource: { type: 'settings', id: 'agents.agents' },
    action: 'manage',
  });

  return (
    <PageContainer>
      <PageHeader
        title={t('projectManager.title')}
        description={t('projectManager.pageDescription')}
      />
      {settings.isPending || options.isPending ? (
        <Skeleton className='h-64 w-full' />
      ) : null}
      {settings.isError ? (
        <Alert variant='destructive'>
          <AlertDescription>{settings.error.message}</AlertDescription>
        </Alert>
      ) : null}
      {settings.data && options.data ? (
        <ProjectManagerForm
          settings={settings.data}
          options={options.data}
          canManage={canManage}
        />
      ) : null}
    </PageContainer>
  );
}
