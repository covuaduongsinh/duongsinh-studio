/** `/settings/lessons`: Lessons learned management page (H2a). */
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { Check, GraduationCap, Plus, RefreshCw, X } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { ProposeLessonDialog } from '#components/propose-lesson-dialog';
import { Badge } from '#components/ui/badge';
import { Button } from '#components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { Skeleton } from '#components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';
import { useDecideLesson, useLessons, type Lesson } from '#hooks/use-lessons';

export default function LessonsSettingsPage(): ReactElement {
  const { t } = useTranslation();
  const { can: canManage } = useCan({
    resource: { type: 'settings', id: 'agents.agents' },
    action: 'manage',
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const lessonsQuery = useLessons({
    status: statusFilter === 'all' ? undefined : statusFilter,
    limit: 100,
  });

  const decide = useDecideLesson();

  const lessons = lessonsQuery.data ?? [];

  const handleDecide = (lesson: Lesson, decision: 'accept' | 'reject') => {
    decide.mutate({ id: lesson.id, decision });
  };

  const statusVariant = (status: Lesson['status']) => {
    switch (status) {
      case 'applied':
        return 'default';
      case 'accepted':
        return 'secondary';
      case 'rejected':
        return 'destructive';
      case 'proposed':
      default:
        return 'outline';
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title={t('lessons.settingsTitle')}
        description={t('lessons.settingsDescription')}
        actions={
          <div className='flex items-center gap-2'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => void lessonsQuery.refetch()}
              disabled={lessonsQuery.isFetching}
            >
              <RefreshCw
                className={`mr-1.5 h-3.5 w-3.5 ${
                  lessonsQuery.isFetching ? 'animate-spin' : ''
                }`}
              />
              {t('lessons.refresh')}
            </Button>
            <Button size='sm' onClick={() => setDialogOpen(true)}>
              <Plus className='mr-1.5 h-3.5 w-3.5' />
              {t('lessons.newAction')}
            </Button>
          </div>
        }
      />

      <div className='grid gap-6'>
        <Card>
          <CardHeader className='flex flex-row items-center justify-between pb-4'>
            <div>
              <CardTitle>{t('lessons.listTitle')}</CardTitle>
              <CardDescription>{t('lessons.listDescription')}</CardDescription>
            </div>
            <div className='w-44'>
              <Select
                value={statusFilter}
                onValueChange={(val) => setStatusFilter(val || 'all')}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('lessons.filterStatus')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>
                    {t('lessons.filters.all')}
                  </SelectItem>
                  <SelectItem value='proposed'>
                    {t('lessons.status.proposed')}
                  </SelectItem>
                  <SelectItem value='applied'>
                    {t('lessons.status.applied')}
                  </SelectItem>
                  <SelectItem value='rejected'>
                    {t('lessons.status.rejected')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {lessonsQuery.isLoading ? (
              <div className='grid gap-3'>
                <Skeleton className='h-12 w-full' />
                <Skeleton className='h-12 w-full' />
                <Skeleton className='h-12 w-full' />
              </div>
            ) : lessons.length === 0 ? (
              <div className='flex flex-col items-center justify-center p-8 text-center text-muted-foreground'>
                <GraduationCap className='mb-2 h-8 w-8 text-muted-foreground/60' />
                <p className='text-sm'>{t('lessons.empty')}</p>
              </div>
            ) : (
              <div className='rounded-md border'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className='w-28'>{t('lessons.tag')}</TableHead>
                      <TableHead>{t('lessons.mistakeAndRule')}</TableHead>
                      <TableHead className='w-40'>
                        {t('lessons.target')}
                      </TableHead>
                      <TableHead className='w-28'>
                        {t('lessons.statusLabel')}
                      </TableHead>
                      {canManage && (
                        <TableHead className='w-32 text-right'>
                          {t('lessons.actions')}
                        </TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lessons.map((lesson) => (
                      <TableRow key={lesson.id}>
                        <TableCell>
                          <Badge variant='outline'>{lesson.tag}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className='space-y-1'>
                            <div className='text-xs text-muted-foreground'>
                              <span className='font-semibold text-destructive/80'>
                                {t('lessons.mistakePrefix')}:
                              </span>{' '}
                              {lesson.mistake}
                            </div>
                            <div className='text-sm font-medium'>
                              <span className='font-semibold text-primary'>
                                {t('lessons.rulePrefix')}:
                              </span>{' '}
                              {lesson.rule}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className='text-xs'>
                            <div className='font-medium'>
                              {t(`lessons.targets.${lesson.target}`)}
                            </div>
                            {lesson.targetRef && (
                              <div className='font-mono text-muted-foreground truncate max-w-[140px]'>
                                {lesson.targetRef}
                              </div>
                            )}
                            {lesson.appliedRef && (
                              <div className='text-[10px] text-emerald-600 truncate max-w-[140px]'>
                                {lesson.appliedRef}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(lesson.status)}>
                            {t(`lessons.status.${lesson.status}`)}
                          </Badge>
                        </TableCell>
                        {canManage && (
                          <TableCell className='text-right'>
                            {lesson.status === 'proposed' && (
                              <div className='flex items-center justify-end gap-1'>
                                <Button
                                  size='icon'
                                  variant='ghost'
                                  className='h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50'
                                  title={t('lessons.acceptAndApply')}
                                  disabled={decide.isPending}
                                  onClick={() => handleDecide(lesson, 'accept')}
                                >
                                  <Check className='h-4 w-4' />
                                </Button>
                                <Button
                                  size='icon'
                                  variant='ghost'
                                  className='h-7 w-7 text-destructive hover:bg-destructive/10'
                                  title={t('lessons.reject')}
                                  disabled={decide.isPending}
                                  onClick={() => handleDecide(lesson, 'reject')}
                                >
                                  <X className='h-4 w-4' />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ProposeLessonDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </PageContainer>
  );
}
