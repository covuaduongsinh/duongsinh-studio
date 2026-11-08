/**
 * A project's "Code": the linked repositories it works in, the primary one first, and (for an administrator, as the
 * server requires) a form attaching another linked repository through `POST /api/projects/{projectId}/codeLocations`.
 */
import { useToaster } from '@nocobase/app-client';
import {
  canUseSetting,
  useViewer,
} from '@nocobase/app-plugin-projects/client/kit';
import { useTranslation } from '@nocobase/i18n/client';
import {
  ExternalLinkIcon,
  LoaderCircle,
  PlusIcon,
  WorkflowIcon,
} from 'lucide-react';
import { useState, type FormEvent, type ReactElement } from 'react';

import { Badge } from '#components/ui/badge';
import { Button } from '#components/ui/button';
import { Checkbox } from '#components/ui/checkbox';
import { Field, FieldLabel } from '#components/ui/field';
import { Label } from '#components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { ProjectSection } from '#extensions/nocobase-project-detail/project-detail';
import {
  useAttachRepository,
  useGitRepositories,
  useProposeCi,
  type GitRepository,
} from '#hooks/use-git';
import { useGitErrorText } from '#hooks/use-git-error-text';

function AttachRepositoryForm({
  projectId,
  candidates,
  first,
}: {
  readonly projectId: string;
  readonly candidates: readonly GitRepository[];
  /** The project has no repository yet, so the one attached becomes primary anyway. */
  readonly first: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const toaster = useToaster();
  const errorText = useGitErrorText();
  const attach = useAttachRepository(projectId);
  const [repositoryId, setRepositoryId] = useState<string | null>(null);
  const [primary, setPrimary] = useState(false);
  const items = candidates.map((repository) => ({
    value: repository.id,
    label: repository.repo,
  }));

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (!repositoryId) return;
    attach.mutate(
      { repositoryId, primary: first || primary },
      {
        onSuccess: (attached) => {
          setRepositoryId(null);
          setPrimary(false);
          toaster.show({
            type: 'success',
            title: t('git.projectCode.attached', { repo: attached.repo }),
          });
        },
        onError: (error) =>
          toaster.show({ type: 'error', title: errorText(error) }),
      },
    );
  };

  return (
    <form
      onSubmit={submit}
      className='flex flex-col gap-3 sm:flex-row sm:items-end'
      aria-label={t('git.projectCode.attach')}
    >
      <Field className='min-w-0 flex-1'>
        <FieldLabel htmlFor='project-code-repository'>
          {t('git.projectCode.repository')}
        </FieldLabel>
        <Select
          items={items}
          value={repositoryId}
          disabled={attach.isPending}
          onValueChange={(value: string | null) => setRepositoryId(value)}
        >
          <SelectTrigger id='project-code-repository' className='w-full'>
            <SelectValue>
              {(value: string | null) =>
                items.find((item) => item.value === value)?.label ?? (
                  <span className='text-muted-foreground'>
                    {t('git.projectCode.chooseRepository')}
                  </span>
                )
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {first ? null : (
        <div className='flex items-center gap-2 sm:pb-2'>
          <Checkbox
            id='project-code-primary'
            checked={primary}
            disabled={attach.isPending}
            onCheckedChange={(checked) => setPrimary(checked)}
          />
          <Label htmlFor='project-code-primary'>
            {t('git.projectCode.makePrimary')}
          </Label>
        </div>
      )}
      <Button type='submit' disabled={!repositoryId || attach.isPending}>
        {attach.isPending ? (
          <LoaderCircle data-icon='inline-start' className='animate-spin' />
        ) : (
          <PlusIcon data-icon='inline-start' />
        )}
        {attach.isPending
          ? t('git.projectCode.attaching')
          : t('git.projectCode.attach')}
      </Button>
    </form>
  );
}

/** Adds the pull request check to the primary repository through a pull request, with the caller's own token. */
function ProposeCiButton({
  projectId,
}: {
  readonly projectId: string;
}): ReactElement {
  const { t } = useTranslation();
  const toaster = useToaster();
  const errorText = useGitErrorText();
  const propose = useProposeCi(projectId);
  return (
    <div className='flex flex-col gap-1'>
      <Button
        type='button'
        variant='outline'
        className='self-start'
        disabled={propose.isPending}
        onClick={() =>
          propose.mutate(undefined, {
            onSuccess: ({ pullRequest }) =>
              toaster.show({
                type: 'success',
                title: t('git.projectCode.ciProposed', {
                  number: pullRequest.number,
                  url: pullRequest.url,
                }),
              }),
            onError: (error) =>
              toaster.show({ type: 'error', title: errorText(error) }),
          })
        }
      >
        {propose.isPending ? (
          <LoaderCircle data-icon='inline-start' className='animate-spin' />
        ) : (
          <WorkflowIcon data-icon='inline-start' />
        )}
        {propose.isPending
          ? t('git.projectCode.addingCi')
          : t('git.projectCode.addCi')}
      </Button>
      <p className='text-xs text-muted-foreground'>
        {t('git.projectCode.ciHint')}
      </p>
    </div>
  );
}

export function ProjectCode({
  projectId,
}: {
  readonly projectId: string;
}): ReactElement {
  const { t } = useTranslation();
  const viewer = useViewer();
  const repositories = useGitRepositories();
  const isAdmin = canUseSetting(viewer, 'pm.members', 'define-roles');
  const linkOf = (repository: GitRepository) =>
    repository.projects.find((link) => link.projectId === projectId);
  const attached = (repositories.data ?? [])
    .filter((repository) => linkOf(repository) !== undefined)
    .sort(
      (a, b) =>
        Number(linkOf(b)?.isPrimary ?? false) -
        Number(linkOf(a)?.isPrimary ?? false),
    );
  const candidates = (repositories.data ?? []).filter(
    (repository) => linkOf(repository) === undefined,
  );

  let content: ReactElement;
  if (repositories.error)
    content = (
      <p role='alert' className='text-sm text-destructive'>
        {t('git.projectCode.loadFailed')}
      </p>
    );
  else if (!repositories.data)
    content = (
      <LoaderCircle className='size-4 animate-spin text-muted-foreground' />
    );
  else
    content = (
      <div className='flex flex-col gap-4'>
        {attached.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('git.projectCode.empty')}
          </p>
        ) : (
          <ul className='divide-y rounded-lg border'>
            {attached.map((repository) => (
              <li
                key={repository.id}
                className='flex items-center justify-between gap-2 px-3 py-2 text-sm'
              >
                <a
                  href={repository.webUrl}
                  target='_blank'
                  rel='noreferrer'
                  className='inline-flex min-w-0 items-center gap-1 font-medium hover:underline'
                >
                  <span className='truncate'>{repository.repo}</span>
                  <ExternalLinkIcon
                    aria-hidden='true'
                    className='size-3.5 shrink-0 text-muted-foreground'
                  />
                </a>
                <span className='flex shrink-0 items-center gap-2'>
                  <span className='font-mono text-xs text-muted-foreground'>
                    {repository.defaultBranch}
                  </span>
                  {linkOf(repository)?.isPrimary ? (
                    <Badge variant='secondary'>
                      {t('git.projectCode.primary')}
                    </Badge>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
        {isAdmin && attached.length > 0 ? (
          <ProposeCiButton projectId={projectId} />
        ) : null}
        {isAdmin ? (
          candidates.length > 0 ? (
            <AttachRepositoryForm
              projectId={projectId}
              candidates={candidates}
              first={attached.length === 0}
            />
          ) : (
            <p className='text-sm text-muted-foreground'>
              {t('git.projectCode.noneToAttach')}
            </p>
          )
        ) : null}
      </div>
    );

  return (
    <ProjectSection
      title={t('git.projectCode.title')}
      description={t('git.projectCode.description')}
    >
      {content}
    </ProjectSection>
  );
}
