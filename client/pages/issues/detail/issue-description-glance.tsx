import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';
import { cn } from 'cn';

import { MarkdownView } from '#components/markdown-view';

/** Longer than this, or with more lines than the clamp, and the description folds. */
const FOLD_CHARS = 200;
const FOLD_LINES = 3;

/**
 * The first lines of the description under the title (V2.2): the person who opens an issue from a notice sees what it is
 * about without a tap on the Description tab, which stays for editing. Folds when long, with "Show more".
 */
export function IssueDescriptionGlance({
  description,
}: {
  readonly description: string | null;
}): ReactElement | null {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const text = description?.trim() ?? '';
  if (text === '') return null;
  const folds =
    text.length > FOLD_CHARS || text.split('\n').length > FOLD_LINES;
  return (
    <div className='flex flex-col gap-1' data-testid='issue-description-glance'>
      <div className={cn('text-sm', folds && !open && 'line-clamp-3')}>
        <MarkdownView content={text} />
      </div>
      {folds ? (
        <button
          type='button'
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className='w-fit text-sm font-medium text-primary underline-offset-4 hover:underline'
        >
          {t(open ? 'issueDetail.glance.less' : 'issueDetail.glance.more')}
        </button>
      ) : null}
    </div>
  );
}
