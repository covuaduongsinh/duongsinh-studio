/** Settings → Verifications: failure thresholds, policies and recent audit history. */
import { useToaster } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { useState, type FormEvent, type ReactElement } from 'react';

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
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
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
  useVerificationSettings,
  useSaveVerificationSettings,
  useRecentVerifications,
} from '#hooks/use-verifications';

function ThresholdForm({
  initialValue,
  canManage,
  isPending,
  onSave,
}: {
  readonly initialValue: number;
  readonly canManage: boolean;
  readonly isPending: boolean;
  readonly onSave: (val: number) => void;
}): ReactElement {
  const { t } = useTranslation();
  const [maxFailures, setMaxFailures] = useState<number>(initialValue);

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    if (maxFailures < 1) return;
    onSave(maxFailures);
  };

  return (
    <form onSubmit={handleSubmit} className='flex items-end gap-4'>
      <div className='space-y-2 max-w-xs'>
        <Label htmlFor='maxConsecutiveFailures'>
          {t('settingsVerifications.maxConsecutiveFailuresLabel')}
        </Label>
        <Input
          id='maxConsecutiveFailures'
          type='number'
          min={1}
          max={10}
          value={maxFailures}
          disabled={!canManage || isPending}
          onChange={(e) => setMaxFailures(Number(e.target.value))}
        />
      </div>
      {canManage && (
        <Button
          type='submit'
          disabled={
            isPending || maxFailures === initialValue || maxFailures < 1
          }
        >
          {isPending
            ? t('settingsVerifications.saving')
            : t('settingsVerifications.save')}
        </Button>
      )}
    </form>
  );
}

export default function VerificationSettingsPage(): ReactElement {
  const { t } = useTranslation();
  const toaster = useToaster();
  const { can: canManage } = useCan({
    resource: { type: 'settings', id: 'agents.agents' },
    action: 'manage',
  });

  const settingsQuery = useVerificationSettings();
  const saveMutation = useSaveVerificationSettings();
  const recentQuery = useRecentVerifications(20);

  const handleSave = (val: number): void => {
    saveMutation.mutate(
      { maxConsecutiveFailures: val },
      {
        onSuccess: () => {
          toaster.show({
            type: 'success',
            title: t('settingsVerifications.savedTitle'),
            description: t('settingsVerifications.savedDescription'),
          });
        },
        onError: (err) => {
          toaster.show({
            type: 'error',
            title: t('settingsVerifications.saveFailedTitle'),
            description: err instanceof Error ? err.message : String(err),
          });
        },
      },
    );
  };

  return (
    <PageContainer>
      <PageHeader
        title={t('settingsVerifications.title')}
        description={t('settingsVerifications.description')}
      />

      <div className='flex flex-col gap-6 mt-6'>
        {/* Card Cấu hình giới hạn thất bại liên tiếp */}
        <Card>
          <CardHeader>
            <div className='flex items-center gap-2'>
              <ShieldCheck className='size-5 text-primary' />
              <CardTitle>{t('settingsVerifications.thresholdTitle')}</CardTitle>
            </div>
            <CardDescription>
              {t('settingsVerifications.thresholdDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {settingsQuery.isLoading ? (
              <div className='space-y-2'>
                <Skeleton className='h-9 w-48' />
              </div>
            ) : (
              <ThresholdForm
                key={settingsQuery.data?.maxConsecutiveFailures ?? 2}
                initialValue={settingsQuery.data?.maxConsecutiveFailures ?? 2}
                canManage={canManage}
                isPending={saveMutation.isPending}
                onSave={handleSave}
              />
            )}
          </CardContent>
        </Card>

        {/* Card Lịch sử kiểm chứng gần đây */}
        <Card>
          <CardHeader className='flex flex-row items-center justify-between'>
            <div>
              <CardTitle>{t('settingsVerifications.recentTitle')}</CardTitle>
              <CardDescription>
                {t('settingsVerifications.recentDescription')}
              </CardDescription>
            </div>
            <Button
              variant='outline'
              size='sm'
              disabled={recentQuery.isFetching}
              onClick={() => void recentQuery.refetch()}
            >
              <RefreshCw
                className={`size-4 mr-2 ${recentQuery.isFetching ? 'animate-spin' : ''}`}
              />
              {t('settingsVerifications.refresh')}
            </Button>
          </CardHeader>
          <CardContent>
            {recentQuery.isLoading ? (
              <div className='space-y-2'>
                <Skeleton className='h-8 w-full' />
                <Skeleton className='h-8 w-full' />
                <Skeleton className='h-8 w-full' />
              </div>
            ) : !recentQuery.data || recentQuery.data.length === 0 ? (
              <p className='text-sm text-muted-foreground py-4'>
                {t('settingsVerifications.noRecent')}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('settingsVerifications.colIssue')}</TableHead>
                    <TableHead>{t('settingsVerifications.colSha')}</TableHead>
                    <TableHead>
                      {t('settingsVerifications.colAttempt')}
                    </TableHead>
                    <TableHead>
                      {t('settingsVerifications.colResult')}
                    </TableHead>
                    <TableHead className='text-right'>
                      {t('settingsVerifications.colTime')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentQuery.data.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className='font-mono text-sm'>
                        {item.issueId}
                      </TableCell>
                      <TableCell className='font-mono text-sm'>
                        {item.headSha.slice(0, 7)}
                      </TableCell>
                      <TableCell>{item.attempt}</TableCell>
                      <TableCell>
                        {item.result === 'passed' ? (
                          <Badge
                            variant='outline'
                            className='bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20'
                          >
                            <CheckCircle2 className='size-3 mr-1 inline' />
                            {t('settingsVerifications.passed')}
                          </Badge>
                        ) : item.result === 'contradicted' ? (
                          <Badge
                            variant='outline'
                            className='border-destructive/40 text-destructive'
                          >
                            <AlertTriangle className='size-3 mr-1 inline' />
                            {t('settingsVerifications.contradicted')}
                          </Badge>
                        ) : (
                          <Badge
                            variant='outline'
                            className='bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20'
                          >
                            <XCircle className='size-3 mr-1 inline' />
                            {t('settingsVerifications.failed')}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className='text-right text-muted-foreground text-sm'>
                        {new Date(item.createdAt).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
