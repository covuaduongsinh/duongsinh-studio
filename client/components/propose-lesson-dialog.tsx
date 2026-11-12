/** Dialog for proposing a new lesson learned (`client/components/propose-lesson-dialog.tsx`). */
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
import { Label } from '#components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { Textarea } from '#components/ui/textarea';
import { useProposeLesson } from '#hooks/use-lessons';

export interface ProposeLessonDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly projectId?: string | null;
  readonly issueId?: string | null;
  readonly reviewId?: string | null;
  readonly defaultMistake?: string;
  readonly defaultRule?: string;
  readonly defaultTag?: string;
  readonly defaultTarget?:
    'skill' | 'knowledge' | 'sensitivePath' | 'projectCriteria';
  readonly defaultTargetRef?: string;
}

export function ProposeLessonDialog({
  open,
  onOpenChange,
  projectId,
  issueId,
  reviewId,
  defaultMistake = '',
  defaultRule = '',
  defaultTag = '',
  defaultTarget = 'skill',
  defaultTargetRef = '',
}: ProposeLessonDialogProps): ReactElement {
  const { t } = useTranslation();
  const propose = useProposeLesson();

  const [tag, setTag] = useState(defaultTag);
  const [mistake, setMistake] = useState(defaultMistake);
  const [rule, setRule] = useState(defaultRule);
  const [target, setTarget] = useState<
    'skill' | 'knowledge' | 'sensitivePath' | 'projectCriteria'
  >(defaultTarget);
  const [targetRef, setTargetRef] = useState(defaultTargetRef);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!mistake.trim() || !rule.trim() || !tag.trim()) return;

    propose.mutate(
      {
        projectId,
        issueId,
        reviewId,
        mistake: mistake.trim(),
        rule: rule.trim(),
        tag: tag.trim(),
        target,
        targetRef: targetRef.trim() || null,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          setMistake('');
          setRule('');
          setTag('');
          setTargetRef('');
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-[500px]'>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t('lessons.proposeTitle')}</DialogTitle>
            <DialogDescription>
              {t('lessons.proposeDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className='grid gap-4 py-4'>
            {/* Tag */}
            <div className='grid gap-1.5'>
              <Label htmlFor='lesson-tag'>{t('lessons.tag')}</Label>
              <Input
                id='lesson-tag'
                placeholder={t('lessons.tagPlaceholder')}
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                required
              />
            </div>

            {/* Mistake */}
            <div className='grid gap-1.5'>
              <Label htmlFor='lesson-mistake'>{t('lessons.mistake')}</Label>
              <Textarea
                id='lesson-mistake'
                rows={2}
                placeholder={t('lessons.mistakePlaceholder')}
                value={mistake}
                onChange={(e) => setMistake(e.target.value)}
                required
              />
            </div>

            {/* Rule / Lesson */}
            <div className='grid gap-1.5'>
              <Label htmlFor='lesson-rule'>{t('lessons.rule')}</Label>
              <Textarea
                id='lesson-rule'
                rows={2}
                placeholder={t('lessons.rulePlaceholder')}
                value={rule}
                onChange={(e) => setRule(e.target.value)}
                required
              />
            </div>

            {/* Target Destination */}
            <div className='grid gap-1.5'>
              <Label htmlFor='lesson-target'>{t('lessons.target')}</Label>
              <Select
                value={target}
                onValueChange={(val) => {
                  if (
                    val === 'skill' ||
                    val === 'knowledge' ||
                    val === 'sensitivePath' ||
                    val === 'projectCriteria'
                  ) {
                    setTarget(val);
                  }
                }}
              >
                <SelectTrigger id='lesson-target'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='skill'>
                    {t('lessons.targets.skill')}
                  </SelectItem>
                  <SelectItem value='knowledge'>
                    {t('lessons.targets.knowledge')}
                  </SelectItem>
                  <SelectItem value='sensitivePath'>
                    {t('lessons.targets.sensitivePath')}
                  </SelectItem>
                  <SelectItem value='projectCriteria'>
                    {t('lessons.targets.projectCriteria')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Target Ref */}
            <div className='grid gap-1.5'>
              <Label htmlFor='lesson-target-ref'>
                {t('lessons.targetRef')}
              </Label>
              <Input
                id='lesson-target-ref'
                placeholder={
                  target === 'skill'
                    ? 'ds-development'
                    : target === 'sensitivePath'
                      ? 'server/.env'
                      : target === 'projectCriteria'
                        ? 'pnpm test:unit'
                        : ''
                }
                value={targetRef}
                onChange={(e) => setTargetRef(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => onOpenChange(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type='submit'
              disabled={
                propose.isPending ||
                !mistake.trim() ||
                !rule.trim() ||
                !tag.trim()
              }
            >
              {propose.isPending
                ? t('lessons.saving')
                : t('lessons.proposeAction')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
