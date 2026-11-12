import { useTranslation } from '@nocobase/i18n/client';
import { CheckSquareIcon, PlusIcon, Trash2Icon, Code2Icon } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { Badge } from '#components/ui/badge';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { IssueSection } from '#extensions/nocobase-issue-detail/issue-detail';
import {
  useIssueCriteria,
  useProjectDefaultCriteria,
  type CheckKind,
  type CriteriaItem,
} from '#hooks/use-issue-criteria';

export function CriteriaKindBadge({
  kind,
}: {
  readonly kind: CheckKind;
}): ReactElement {
  const { t } = useTranslation();
  switch (kind) {
    case 'test':
      return (
        <Badge
          variant='outline'
          className='border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300'
        >
          {t('studioCriteria.kinds.test')}
        </Badge>
      );
    case 'command':
      return (
        <Badge
          variant='outline'
          className='border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300'
        >
          {t('studioCriteria.kinds.command')}
        </Badge>
      );
    case 'ci':
      return (
        <Badge
          variant='outline'
          className='border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
        >
          {t('studioCriteria.kinds.ci')}
        </Badge>
      );
    case 'human':
      return (
        <Badge
          variant='outline'
          className='border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
        >
          {t('studioCriteria.kinds.human')}
        </Badge>
      );
  }
}

export function CriteriaSourceBadge({
  source,
}: {
  readonly source?: string;
}): ReactElement | null {
  const { t } = useTranslation();
  if (!source || source === 'human') return null;
  return (
    <Badge variant='secondary' className='text-xs font-normal'>
      {source === 'agent'
        ? t('studioCriteria.source.agent')
        : t('studioCriteria.source.projectDefault')}
    </Badge>
  );
}

export interface CriteriaEditorProps {
  readonly criteria: readonly CriteriaItem[];
  readonly canEdit?: boolean;
  readonly onSave?: (criteria: CriteriaItem[]) => Promise<void>;
  readonly isSaving?: boolean;
  readonly emptyText?: string;
}

export function CriteriaEditor({
  criteria: initialCriteria,
  canEdit = false,
  onSave,
  isSaving = false,
  emptyText,
}: CriteriaEditorProps): ReactElement {
  const { t } = useTranslation();
  const [items, setItems] = useState<CriteriaItem[]>([...initialCriteria]);
  const [dirty, setDirty] = useState(false);

  // New item form state
  const [text, setText] = useState('');
  const [checkKind, setCheckKind] = useState<CheckKind>('test');
  const [checkValue, setCheckValue] = useState('');

  // Keep internal list in sync with props when not dirty
  const currentItems = dirty ? items : [...initialCriteria];

  const handleAdd = () => {
    if (!text.trim()) return;
    const newItem: CriteriaItem = {
      text: text.trim(),
      checkKind,
      checkValue: checkValue.trim() || null,
      source: 'human',
      position: currentItems.length,
    };
    setItems([...currentItems, newItem]);
    setDirty(true);
    setText('');
    setCheckValue('');
  };

  const handleDelete = (index: number) => {
    const next = currentItems.filter((_, i) => i !== index);
    setItems(next);
    setDirty(true);
  };

  const handleSave = async () => {
    if (!onSave) return;
    await onSave(currentItems);
    setDirty(false);
  };

  return (
    <div className='flex flex-col gap-3' data-testid='criteria-editor'>
      {currentItems.length === 0 ? (
        <p className='text-sm text-muted-foreground'>
          {emptyText ?? t('studioCriteria.empty')}
        </p>
      ) : (
        <ul className='flex flex-col gap-2' data-testid='criteria-list'>
          {currentItems.map((item, idx) => (
            <li
              key={item.id ?? `${item.text}-${item.position}`}
              className='flex items-center justify-between gap-3 rounded-lg border bg-card p-3 text-sm shadow-sm'
              data-testid={`criteria-item-${idx}`}
            >
              <div className='flex flex-wrap items-center gap-2'>
                <span className='font-mono text-xs text-muted-foreground'>
                  {idx + 1}.
                </span>
                <CriteriaKindBadge kind={item.checkKind} />
                <span className='font-medium text-foreground'>{item.text}</span>
                {item.checkValue ? (
                  <code className='flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground'>
                    <Code2Icon className='size-3' />
                    {item.checkValue}
                  </code>
                ) : null}
                <CriteriaSourceBadge source={item.source} />
              </div>
              {canEdit ? (
                <Button
                  variant='ghost'
                  size='icon-sm'
                  onClick={() => handleDelete(idx)}
                  aria-label={t('studioCriteria.delete')}
                  className='text-muted-foreground hover:text-destructive'
                >
                  <Trash2Icon className='size-4' />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canEdit ? (
        <div className='flex flex-col gap-3 rounded-lg border border-dashed p-3 bg-muted/20'>
          <div className='flex flex-wrap items-center gap-2'>
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t('studioCriteria.textPlaceholder')}
              className='min-w-[200px] flex-1'
              data-testid='criteria-text-input'
            />
            <select
              value={checkKind}
              onChange={(e) => setCheckKind(e.target.value as CheckKind)}
              className='h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
              data-testid='criteria-kind-select'
            >
              <option value='test'>{t('studioCriteria.kinds.test')}</option>
              <option value='command'>
                {t('studioCriteria.kinds.command')}
              </option>
              <option value='ci'>{t('studioCriteria.kinds.ci')}</option>
              <option value='human'>{t('studioCriteria.kinds.human')}</option>
            </select>
            <Input
              value={checkValue}
              onChange={(e) => setCheckValue(e.target.value)}
              placeholder={t('studioCriteria.valuePlaceholder')}
              className='min-w-[150px] flex-1'
              data-testid='criteria-value-input'
            />
            <Button
              variant='secondary'
              size='sm'
              onClick={handleAdd}
              disabled={!text.trim()}
              data-testid='criteria-add-btn'
            >
              <PlusIcon className='size-4 mr-1' />
              {t('studioCriteria.addCriteria')}
            </Button>
          </div>

          {dirty ? (
            <div className='flex justify-end gap-2 pt-2 border-t'>
              <Button
                variant='outline'
                size='sm'
                onClick={() => {
                  setItems([...initialCriteria]);
                  setDirty(false);
                }}
              >
                {t('studioCriteria.cancel')}
              </Button>
              <Button
                size='sm'
                onClick={() => {
                  void handleSave();
                }}
                disabled={isSaving}
                data-testid='criteria-save-btn'
              >
                {t('studioCriteria.save')}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Section hiển thị tiêu chí nghiệm thu trên trang chi tiết công việc.
 * Gắn vào cạnh IssueDeliveryReport bằng một dòng.
 */
export function IssueCriteriaSection({
  issueId,
  canEdit = false,
}: {
  readonly issueId: string;
  readonly canEdit?: boolean;
}): ReactElement | null {
  const { t } = useTranslation();
  const { criteria, saveCriteria, isLoading } = useIssueCriteria(issueId);
  // An issue without criteria has nothing to read here: for someone who cannot edit the section is left out, and for
  // someone who can it is one line until they ask to add the first (it took a full block on every issue).
  const [adding, setAdding] = useState(false);
  if (isLoading) return null;
  if (criteria.length === 0 && !adding) {
    if (!canEdit) return null;
    return (
      <div className='flex items-center gap-2 text-sm text-muted-foreground'>
        <CheckSquareIcon className='size-4' />
        <span>{t('studioCriteria.empty')}</span>
        <Button
          type='button'
          size='sm'
          variant='outline'
          onClick={() => setAdding(true)}
          data-testid='criteria-open-btn'
        >
          {t('studioCriteria.openEditor')}
        </Button>
      </div>
    );
  }

  return (
    <IssueSection
      icon={<CheckSquareIcon className='size-4' />}
      title={t('studioCriteria.title')}
    >
      <CriteriaEditor
        criteria={criteria}
        canEdit={canEdit}
        onSave={async (updated) => {
          await saveCriteria.mutateAsync(updated);
        }}
        isSaving={saveCriteria.isPending}
      />
    </IssueSection>
  );
}

/**
 * Component quản lý tiêu chí nghiệm thu mặc định trong cài đặt dự án.
 */
export function ProjectDefaultCriteriaCard({
  projectId,
  canManage = false,
}: {
  readonly projectId: string;
  readonly canManage?: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const { defaultCriteria, saveDefaultCriteria, isLoading } =
    useProjectDefaultCriteria(projectId);

  return (
    <div className='flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm'>
      <div>
        <h3 className='text-base font-semibold'>
          {t('studioCriteria.defaultTitle')}
        </h3>
        <p className='text-sm text-muted-foreground'>
          {t('studioCriteria.defaultDescription')}
        </p>
      </div>

      {isLoading ? (
        <p className='text-sm text-muted-foreground'>...</p>
      ) : (
        <CriteriaEditor
          criteria={defaultCriteria}
          canEdit={canManage}
          onSave={async (updated) => {
            await saveDefaultCriteria.mutateAsync(updated);
          }}
          isSaving={saveDefaultCriteria.isPending}
          emptyText={t('studioCriteria.emptyDefault')}
        />
      )}
    </div>
  );
}
