/** Settings → Skills of new projects: what a project created from now on starts with; existing ones keep their own. */
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Button } from '#components/ui/button';
import { Checkbox } from '#components/ui/checkbox';
import { Label } from '#components/ui/label';
import { Skeleton } from '#components/ui/skeleton';
import {
  useProjectDefaultSkills,
  useSetProjectDefaultSkills,
  useSkillLibrary,
} from '#hooks/use-project-setup';

export default function ProjectDefaultSkillsPage(): ReactElement {
  const { t } = useTranslation();
  const library = useSkillLibrary();
  const defaults = useProjectDefaultSkills();
  const save = useSetProjectDefaultSkills();
  // What the person changed; until then what the server says.
  const [edited, setEdited] = useState<readonly string[] | null>(null);
  const chosen = edited ?? defaults.data ?? [];

  const toggle = (id: string, on: boolean): void => {
    setEdited(on ? [...chosen, id] : chosen.filter((item) => item !== id));
  };

  return (
    <PageContainer>
      <PageHeader
        title={t('projectDefaultSkills.title')}
        description={t('projectDefaultSkills.description')}
      />
      {library.isLoading || defaults.isLoading ? (
        <Skeleton className='h-40 w-full' />
      ) : library.isError || defaults.isError ? (
        <p className='text-sm text-destructive'>
          {t('projectDefaultSkills.failed')}
        </p>
      ) : (library.data ?? []).length === 0 ? (
        <p className='text-sm text-muted-foreground'>
          {t('projectDefaultSkills.empty')}
        </p>
      ) : (
        <div className='flex max-w-3xl flex-col gap-4'>
          <ul className='flex flex-col gap-3'>
            {library.data?.map((skill) => (
              <li key={skill.id} className='flex items-start gap-2'>
                <Checkbox
                  id={`skill-${skill.id}`}
                  checked={chosen.includes(skill.id)}
                  onCheckedChange={(checked) =>
                    toggle(skill.id, checked === true)
                  }
                />
                <Label
                  className='flex flex-col items-start gap-0.5'
                  htmlFor={`skill-${skill.id}`}
                >
                  <span className='font-mono text-sm'>{skill.slug}</span>
                  <span className='text-xs font-normal text-muted-foreground'>
                    {skill.description}
                  </span>
                </Label>
              </li>
            ))}
          </ul>
          {save.isError ? (
            <p className='text-sm text-destructive'>
              {t('projectDefaultSkills.saveFailed')}
            </p>
          ) : null}
          <div>
            <Button
              disabled={edited === null || save.isPending}
              onClick={() =>
                save.mutate(chosen, { onSuccess: () => setEdited(null) })
              }
            >
              {t('projectDefaultSkills.save')}
            </Button>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
