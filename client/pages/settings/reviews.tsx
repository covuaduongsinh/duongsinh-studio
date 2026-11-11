/** Settings → Reviews: structured reviews and criteria checks audit history. */
import { useTranslation } from '@nocobase/i18n/client';
import {
  CheckCircle2,
  XCircle,
  FileCheck,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import { Skeleton } from '#components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';
import {
  useRecentReviews,
  type ReviewView,
  type ReviewCriteriaCheck,
} from '#hooks/use-reviews';

function CriteriaChecksDialog({
  review,
  open,
  onOpenChange,
}: {
  readonly review: ReviewView | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}): ReactElement {
  const { t } = useTranslation();
  const checks = review?.criteriaChecks ?? [];
  const unmetCount = checks.filter((c) => !c.passed).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-xl'>
        <DialogHeader>
          <DialogTitle>
            {t('settingsReviews.criteriaModalTitle', {
              pr: review?.pullRequestId
                ? `#${review.pullRequestId.slice(0, 8)}`
                : '',
            })}
          </DialogTitle>
          <DialogDescription>
            {t('settingsReviews.criteriaModalDescription')}
          </DialogDescription>
        </DialogHeader>

        {unmetCount > 0 ? (
          <div className='rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive'>
            <div className='flex items-center gap-1.5 font-medium'>
              <XCircle className='size-4' />
              {t('settingsReviews.unmetAlert', { count: unmetCount })}
            </div>
          </div>
        ) : null}

        <div className='max-h-96 overflow-y-auto'>
          {checks.length === 0 ? (
            <p className='py-4 text-center text-sm text-muted-foreground'>
              {t('settingsReviews.noCriteriaChecks')}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('settingsReviews.criterionId')}</TableHead>
                  <TableHead>{t('settingsReviews.result')}</TableHead>
                  <TableHead>{t('settingsReviews.notes')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {checks.map((check: ReviewCriteriaCheck) => (
                  <TableRow key={check.criterionId}>
                    <TableCell className='font-mono text-xs'>
                      {check.criterionId}
                    </TableCell>
                    <TableCell>
                      {check.passed ? (
                        <Badge
                          variant='secondary'
                          className='flex items-center gap-1 w-fit text-emerald-600 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-400'
                        >
                          <CheckCircle2 className='size-3' />
                          {t('settingsReviews.passed')}
                        </Badge>
                      ) : (
                        <Badge
                          variant='destructive'
                          className='flex items-center gap-1 w-fit'
                        >
                          <XCircle className='size-3' />
                          {t('settingsReviews.failed')}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className='text-sm text-muted-foreground'>
                      {check.notes || '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ReviewSettingsPage(): ReactElement {
  const { t } = useTranslation();
  const recentQuery = useRecentReviews(30);
  const [selectedReview, setSelectedReview] = useState<ReviewView | null>(null);

  const reviews = recentQuery.data ?? [];

  return (
    <PageContainer>
      <PageHeader
        title={t('settingsReviews.title')}
        description={t('settingsReviews.description')}
      />

      <div className='space-y-6 mt-6'>
        <Card>
          <CardHeader className='flex flex-row items-center justify-between'>
            <div>
              <CardTitle className='text-base flex items-center gap-2'>
                <FileCheck className='size-5 text-primary' />
                {t('settingsReviews.recentTitle')}
              </CardTitle>
              <CardDescription>
                {t('settingsReviews.recentDescription')}
              </CardDescription>
            </div>
            <Button
              variant='outline'
              size='sm'
              disabled={recentQuery.isFetching}
              onClick={() => {
                void recentQuery.refetch();
              }}
            >
              <RefreshCw
                className={`size-4 mr-2 ${recentQuery.isFetching ? 'animate-spin' : ''}`}
              />
              {t('settingsReviews.refresh')}
            </Button>
          </CardHeader>
          <CardContent>
            {recentQuery.isLoading ? (
              <div className='space-y-2'>
                <Skeleton className='h-8 w-full' />
                <Skeleton className='h-8 w-full' />
                <Skeleton className='h-8 w-full' />
              </div>
            ) : reviews.length === 0 ? (
              <div className='text-center py-6 text-sm text-muted-foreground'>
                {t('settingsReviews.emptyHistory')}
              </div>
            ) : (
              <div className='overflow-x-auto'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('settingsReviews.createdAt')}</TableHead>
                      <TableHead>{t('settingsReviews.headSha')}</TableHead>
                      <TableHead>{t('settingsReviews.reviewer')}</TableHead>
                      <TableHead>{t('settingsReviews.verdict')}</TableHead>
                      <TableHead>{t('settingsReviews.kind')}</TableHead>
                      <TableHead>
                        {t('settingsReviews.criteriaStatus')}
                      </TableHead>
                      <TableHead>{t('settingsReviews.summary')}</TableHead>
                      <TableHead className='text-right'>
                        {t('settingsReviews.actions')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reviews.map((r) => {
                      const checks = r.criteriaChecks ?? [];
                      const failedCount = checks.filter(
                        (c) => !c.passed,
                      ).length;
                      const isApprove = r.verdict === 'approve';

                      return (
                        <TableRow key={r.id}>
                          <TableCell className='text-xs text-muted-foreground whitespace-nowrap'>
                            {new Date(r.createdAt).toLocaleString()}
                          </TableCell>
                          <TableCell className='font-mono text-xs'>
                            {r.headSha.slice(0, 7)}
                          </TableCell>
                          <TableCell
                            className='text-xs font-mono max-w-[120px] truncate'
                            title={r.reviewerAgentId}
                          >
                            {r.reviewerAgentId}
                          </TableCell>
                          <TableCell>
                            {isApprove ? (
                              <Badge
                                variant='secondary'
                                className='bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                              >
                                {t('settingsReviews.verdicts.approve')}
                              </Badge>
                            ) : (
                              <Badge variant='destructive'>
                                {t('settingsReviews.verdicts.changes')}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className='text-xs capitalize'>
                            {r.kind}
                          </TableCell>
                          <TableCell>
                            {checks.length === 0 ? (
                              <span className='text-xs text-muted-foreground'>
                                —
                              </span>
                            ) : failedCount > 0 ? (
                              <Badge
                                variant='destructive'
                                className='text-xs flex items-center gap-1 w-fit'
                              >
                                <XCircle className='size-3' />
                                {t('settingsReviews.unmetBadge', {
                                  count: failedCount,
                                })}
                              </Badge>
                            ) : (
                              <Badge
                                variant='secondary'
                                className='text-xs flex items-center gap-1 w-fit text-emerald-700 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-300'
                              >
                                <CheckCircle2 className='size-3' />
                                {t('settingsReviews.allPassedBadge', {
                                  count: checks.length,
                                })}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell
                            className='max-w-xs truncate text-xs text-muted-foreground'
                            title={r.summary}
                          >
                            {r.summary}
                          </TableCell>
                          <TableCell className='text-right'>
                            <Button
                              variant='ghost'
                              size='sm'
                              onClick={() => setSelectedReview(r)}
                            >
                              <ExternalLink className='size-3.5 mr-1' />
                              {t('settingsReviews.viewDetails')}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <CriteriaChecksDialog
        review={selectedReview}
        open={Boolean(selectedReview)}
        onOpenChange={(open) => {
          if (!open) setSelectedReview(null);
        }}
      />
    </PageContainer>
  );
}
