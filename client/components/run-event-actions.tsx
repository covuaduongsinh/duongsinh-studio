import { useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { Button } from '#components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import { Input } from '#components/ui/input';
import { Textarea } from '#components/ui/textarea';
import { useContinueFrom, useLessonFromRun } from '#hooks/use-run-profile';

/**
 * Two things to do from a step of a run's log (plan T, T11): continue the issue from here, and keep what went wrong as a
 * lesson waiting for approval. The server checks the person may change the issue and masks secrets in what it carries.
 */
export function RunEventActions({
  runId,
  seq,
}: {
  readonly runId: string;
  readonly seq: number;
}): ReactElement {
  const { t } = useTranslation();
  const toaster = useToaster();
  const proceed = useContinueFrom(runId);
  const lesson = useLessonFromRun(runId);
  const [open, setOpen] = useState<'continue' | 'lesson' | null>(null);
  const [note, setNote] = useState('');
  const [rule, setRule] = useState('');
  const [tag, setTag] = useState('');
  const fail = (title: string) => (error: unknown) =>
    toaster.show({
      type: 'error',
      title,
      description: error instanceof Error ? error.message : String(error),
    });
  return (
    <span className='ml-auto flex shrink-0 gap-1'>
      <Button
        variant='ghost'
        size='xs'
        onClick={() => setOpen('continue')}
        aria-label={t('runProfile.continueFrom', { seq })}
      >
        {t('runProfile.continueShort')}
      </Button>
      <Button
        variant='ghost'
        size='xs'
        onClick={() => setOpen('lesson')}
        aria-label={t('runProfile.lessonFrom', { seq })}
      >
        {t('runProfile.lessonShort')}
      </Button>
      <Dialog
        open={open !== null}
        onOpenChange={(next) => !next && setOpen(null)}
      >
        <DialogContent>
          {open === 'continue' ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {t('runProfile.continueFrom', { seq })}
                </DialogTitle>
                <DialogDescription>
                  {t('runProfile.continueDescription')}
                </DialogDescription>
              </DialogHeader>
              <Textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                aria-label={t('runProfile.note')}
                rows={4}
              />
              <DialogFooter>
                <Button
                  disabled={proceed.isPending}
                  onClick={() =>
                    proceed.mutate(
                      { seq, ...(note.trim() ? { note: note.trim() } : {}) },
                      {
                        onSuccess: (result) => {
                          toaster.show({
                            type: result.started ? 'success' : 'error',
                            title: result.started
                              ? t('runProfile.started')
                              : t('runProfile.notStarted', {
                                  reason: result.skipped ?? '',
                                }),
                          });
                          setOpen(null);
                        },
                        onError: fail(t('runProfile.failed')),
                      },
                    )
                  }
                >
                  {t('runProfile.continueAction')}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>{t('runProfile.lessonFrom', { seq })}</DialogTitle>
                <DialogDescription>
                  {t('runProfile.lessonDescription')}
                </DialogDescription>
              </DialogHeader>
              <Textarea
                value={rule}
                onChange={(event) => setRule(event.target.value)}
                aria-label={t('runProfile.rule')}
                rows={3}
              />
              <Input
                value={tag}
                onChange={(event) => setTag(event.target.value)}
                aria-label={t('runProfile.tag')}
                placeholder={t('runProfile.tag')}
              />
              <DialogFooter>
                <Button
                  disabled={
                    lesson.isPending || rule.trim() === '' || tag.trim() === ''
                  }
                  onClick={() =>
                    lesson.mutate(
                      {
                        seq,
                        rule: rule.trim(),
                        tag: tag.trim(),
                        target: 'skill',
                      },
                      {
                        onSuccess: () => {
                          toaster.show({
                            type: 'success',
                            title: t('runProfile.lessonSaved'),
                          });
                          setOpen(null);
                          setRule('');
                          setTag('');
                        },
                        onError: fail(t('runProfile.failed')),
                      },
                    )
                  }
                >
                  {t('runProfile.lessonAction')}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </span>
  );
}
