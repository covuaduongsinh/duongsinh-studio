/**
 * `/project-setup`: a project with its repository and first issue, in one step (`POST /api/projectSetups`). Under a
 * personal GitHub account a new repository needs the person's own token, which this page asks for when the server does.
 */
import { ApiClientError } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type FormEvent, type ReactElement } from 'react';
import { useNavigate } from 'react-router';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Button } from '#components/ui/button';
import { Checkbox } from '#components/ui/checkbox';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import { Textarea } from '#components/ui/textarea';
import { isKnownGitReason, useGitErrorText } from '#hooks/use-git-error-text';
import {
  useConnectPersonalToken,
  useGitConnectionChoices,
  useProjectSetup,
  useProjectSetupTemplate,
  type ProjectInitChoice,
  type ProjectSetupInput,
} from '#hooks/use-project-setup';

const LOCATIONS = ['none', 'existingRepo', 'newRepo'] as const;
type Location = (typeof LOCATIONS)[number];
const METHODS = ['empty', 'nocobase', 'prompt'] as const;
type Method = (typeof METHODS)[number];

const reasonOf = (error: unknown): string | null =>
  error instanceof ApiClientError ? (error.reason ?? null) : null;

/** Refusals of the setup itself, worded under `projectSetup.errors`; an error's `message` is never shown to people. */
const SETUP_REASONS = new Set([
  'GIT_REPOSITORY_EMPTY',
  'GIT_REPOSITORY_NOT_INSTALLED',
  'GIT_REPOSITORY_NAME_TAKEN',
  'APP_TEMPLATE_UNKNOWN',
]);

export default function ProjectSetupPage(): ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const connections = useGitConnectionChoices();
  const setup = useProjectSetup();
  const connect = useConnectPersonalToken();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState<Location>('none');
  const [connectionChoice, setConnectionChoice] = useState<string | null>(null);
  const [repo, setRepo] = useState('');
  const [privateRepo, setPrivateRepo] = useState(true);
  const [method, setMethod] = useState<Method>('empty');
  const [prompt, setPrompt] = useState('');
  const [token, setToken] = useState('');
  const [withCheck, setWithCheck] = useState(true);
  // A project made with something to tell: the page stays so the notes are read, with a way on to the project.
  const [made, setMade] = useState<{
    projectId: string;
    notes: string[];
  } | null>(null);

  const gitErrorText = useGitErrorText();
  const connectionId = connectionChoice ?? connections.data?.[0]?.id ?? null;
  const needsRepo = location !== 'none';
  const template = useProjectSetupTemplate(needsRepo && method === 'nocobase');
  const failure = reasonOf(setup.error);
  const needsToken = failure === 'GIT_PERSONAL_TOKEN_REQUIRED';
  const failureText =
    failure && SETUP_REASONS.has(failure)
      ? t(`projectSetup.errors.${failure}`)
      : isKnownGitReason(failure)
        ? gitErrorText(setup.error)
        : t('projectSetup.failed');
  const ready =
    name.trim().length > 0 &&
    (!needsRepo || (connectionId !== null && repo.trim().length > 0)) &&
    (!needsRepo || method !== 'prompt' || prompt.trim().length > 0);

  const inputOf = (): ProjectSetupInput | null => {
    const base = {
      name: name.trim(),
      ...(description.trim() ? { description: description.trim() } : {}),
    };
    if (location === 'none' || !connectionId)
      return { ...base, codeLocation: 'none' };
    const init: ProjectInitChoice =
      method === 'prompt' ? { method, prompt: prompt.trim() } : { method };
    const repository = repo.trim();
    if (location === 'newRepo')
      return {
        ...base,
        codeLocation: 'newRepo',
        newRepo: {
          connectionId,
          name: repository,
          private: privateRepo,
          init,
        },
        ...(withCheck ? { ci: { workflow: 'ds-check' as const } } : {}),
      };
    return {
      ...base,
      codeLocation: 'existingRepo',
      existingRepo: {
        connectionId,
        fullName: repository,
        cloneUrl: `https://github.com/${repository}.git`,
        defaultBranch: 'main',
        init,
      },
    };
  };

  const send = (): void => {
    const input = inputOf();
    if (!input) return;
    setup.mutate(input, {
      onSuccess: (answer) => {
        const notes = [answer.meta?.message, answer.data.deployError].filter(
          (note): note is string => typeof note === 'string' && note !== '',
        );
        if (notes.length === 0)
          void navigate(`/projects/${answer.data.projectId}`);
        else setMade({ projectId: answer.data.projectId, notes });
      },
    });
  };

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (!ready) return;
    if (needsToken && connectionId && token.trim()) {
      connect.mutate(
        { connectionId, token: token.trim() },
        {
          onSuccess: () => {
            setToken('');
            send();
          },
        },
      );
      return;
    }
    send();
  };

  return (
    <PageContainer>
      <PageHeader
        title={t('projectSetup.title')}
        description={t('projectSetup.description')}
      />
      <form className='flex max-w-2xl flex-col gap-5' onSubmit={submit}>
        <div className='flex flex-col gap-2'>
          <Label htmlFor='setup-name'>{t('projectSetup.name')}</Label>
          <Input
            id='setup-name'
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className='flex flex-col gap-2'>
          <Label htmlFor='setup-description'>
            {t('projectSetup.projectDescription')}
          </Label>
          <Textarea
            id='setup-description'
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>

        <fieldset className='flex flex-col gap-2'>
          <legend className='mb-1 text-sm font-medium'>
            {t('projectSetup.code')}
          </legend>
          <div className='flex flex-wrap gap-1'>
            {LOCATIONS.map((item) => (
              <Button
                key={item}
                aria-pressed={location === item}
                size='sm'
                type='button'
                variant={location === item ? 'secondary' : 'ghost'}
                onClick={() => setLocation(item)}
              >
                {t(`projectSetup.location.${item}`)}
              </Button>
            ))}
          </div>
        </fieldset>

        {needsRepo ? (
          <>
            {(connections.data?.length ?? 0) > 1 ? (
              <fieldset className='flex flex-col gap-2'>
                <legend className='mb-1 text-sm font-medium'>
                  {t('projectSetup.connection')}
                </legend>
                <div className='flex flex-wrap gap-1'>
                  {connections.data?.map((connection) => (
                    <Button
                      key={connection.id}
                      aria-pressed={connectionId === connection.id}
                      size='sm'
                      type='button'
                      variant={
                        connectionId === connection.id ? 'secondary' : 'ghost'
                      }
                      onClick={() => setConnectionChoice(connection.id)}
                    >
                      {connection.name}
                    </Button>
                  ))}
                </div>
              </fieldset>
            ) : null}
            {connections.data?.length === 0 ? (
              <p className='text-sm text-destructive'>
                {t('projectSetup.noConnection')}
              </p>
            ) : null}
            <div className='flex flex-col gap-2'>
              <Label htmlFor='setup-repo'>
                {t(
                  location === 'newRepo'
                    ? 'projectSetup.repoName'
                    : 'projectSetup.repoFullName',
                )}
              </Label>
              <Input
                id='setup-repo'
                value={repo}
                onChange={(event) => setRepo(event.target.value)}
              />
            </div>
            {location === 'newRepo' ? (
              <div className='flex items-center gap-2'>
                <Checkbox
                  id='setup-private'
                  checked={privateRepo}
                  onCheckedChange={(checked) =>
                    setPrivateRepo(checked === true)
                  }
                />
                <Label htmlFor='setup-private'>
                  {t('projectSetup.private')}
                </Label>
              </div>
            ) : null}
            {location === 'newRepo' ? (
              <div className='flex flex-col gap-1'>
                <div className='flex items-center gap-2'>
                  <Checkbox
                    id='setup-check'
                    checked={withCheck}
                    onCheckedChange={(checked) =>
                      setWithCheck(checked === true)
                    }
                  />
                  <Label htmlFor='setup-check'>
                    {t('projectSetup.checkWorkflow')}
                  </Label>
                </div>
                <p className='text-xs text-muted-foreground'>
                  {t('projectSetup.checkWorkflowHint')}
                </p>
              </div>
            ) : null}
            <fieldset className='flex flex-col gap-2'>
              <legend className='mb-1 text-sm font-medium'>
                {t('projectSetup.init')}
              </legend>
              <div className='flex flex-wrap gap-1'>
                {METHODS.map((item) => (
                  <Button
                    key={item}
                    aria-pressed={method === item}
                    size='sm'
                    type='button'
                    variant={method === item ? 'secondary' : 'ghost'}
                    onClick={() => setMethod(item)}
                  >
                    {t(`projectSetup.method.${item}`)}
                  </Button>
                ))}
              </div>
            </fieldset>
            {method === 'nocobase' ? (
              <p className='text-xs text-muted-foreground'>
                {template.data
                  ? t('projectSetup.templateVersion', {
                      packageName: template.data.packageName,
                      version: template.data.version,
                    })
                  : template.isError
                    ? t('projectSetup.errors.APP_TEMPLATE_UNKNOWN')
                    : null}
              </p>
            ) : null}
            {method === 'prompt' ? (
              <div className='flex flex-col gap-2'>
                <Label htmlFor='setup-prompt'>{t('projectSetup.prompt')}</Label>
                <Textarea
                  id='setup-prompt'
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                />
              </div>
            ) : null}
          </>
        ) : null}

        {needsToken ? (
          <div className='flex flex-col gap-2'>
            <Label htmlFor='setup-token'>{t('projectSetup.token')}</Label>
            <Input
              id='setup-token'
              autoComplete='off'
              type='password'
              value={token}
              onChange={(event) => setToken(event.target.value)}
            />
            <p className='text-xs text-muted-foreground'>
              {t('projectSetup.tokenHint')}
            </p>
          </div>
        ) : setup.isError ? (
          <p className='text-sm text-destructive' role='alert'>
            {failureText}
          </p>
        ) : null}
        {connect.isError ? (
          <p className='text-sm text-destructive'>
            {t('projectSetup.tokenFailed')}
          </p>
        ) : null}
        {made ? (
          <div className='flex flex-col items-start gap-2' role='status'>
            {made.notes.map((note) => (
              <p className='text-sm' key={note}>
                {note}
              </p>
            ))}
            <Button
              type='button'
              variant='secondary'
              onClick={() => void navigate(`/projects/${made.projectId}`)}
            >
              {t('projectSetup.open')}
            </Button>
          </div>
        ) : null}

        <div>
          <Button
            disabled={!ready || setup.isPending || connect.isPending}
            type='submit'
          >
            {t('projectSetup.create')}
          </Button>
        </div>
      </form>
    </PageContainer>
  );
}
