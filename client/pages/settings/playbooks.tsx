import { useTranslation } from '@nocobase/i18n/client';
import { BookOpen, RefreshCw, Terminal, CheckCircle2 } from 'lucide-react';
import type { ReactElement } from 'react';

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
  usePlaybooks,
  usePlaybookInvocations,
  type Playbook,
  type PlaybookInvocation,
} from '#hooks/use-playbooks';

export default function PlaybooksSettingsPage(): ReactElement {
  const { t } = useTranslation();
  const playbooksQuery = usePlaybooks();
  const invocationsQuery = usePlaybookInvocations();

  const playbooks = playbooksQuery.data ?? [];
  const invocations = invocationsQuery.data ?? [];

  return (
    <PageContainer>
      <PageHeader
        title={t('playbooks.settingsTitle')}
        description={t('playbooks.settingsDescription')}
        actions={
          <Button
            variant='outline'
            size='sm'
            onClick={() => {
              void playbooksQuery.refetch();
              void invocationsQuery.refetch();
            }}
            disabled={playbooksQuery.isFetching || invocationsQuery.isFetching}
          >
            <RefreshCw
              className={`mr-1.5 h-3.5 w-3.5 ${
                playbooksQuery.isFetching || invocationsQuery.isFetching
                  ? 'animate-spin'
                  : ''
              }`}
            />
            {t('playbooks.refresh')}
          </Button>
        }
      />

      <div className='space-y-6 pt-4'>
        <Card>
          <CardHeader>
            <CardTitle className='text-base font-medium flex items-center gap-2'>
              <Terminal className='h-4 w-4 text-primary' />
              {t('playbooks.syntaxTitle')}
            </CardTitle>
            <CardDescription>
              {t('playbooks.syntaxDescription')}
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='text-base font-medium flex items-center gap-2'>
              <BookOpen className='h-4 w-4 text-primary' />
              {t('playbooks.listTitle')}
            </CardTitle>
            <CardDescription>{t('playbooks.listDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            {playbooksQuery.isLoading ? (
              <div className='space-y-3'>
                <Skeleton className='h-12 w-full' />
                <Skeleton className='h-12 w-full' />
              </div>
            ) : playbooks.length === 0 ? (
              <div className='py-8 text-center text-sm text-muted-foreground'>
                {t('playbooks.empty')}
              </div>
            ) : (
              <div className='grid gap-4 md:grid-cols-2'>
                {playbooks.map((pb: Playbook) => (
                  <Card key={pb.slug} className='border-muted bg-muted/20'>
                    <CardHeader className='pb-3'>
                      <div className='flex items-center justify-between'>
                        <Badge
                          variant='outline'
                          className='font-mono font-bold'
                        >
                          !{pb.slug}
                        </Badge>
                        <span className='text-xs text-muted-foreground'>
                          {pb.skillName}
                        </span>
                      </div>
                      <CardTitle className='text-sm font-semibold pt-1'>
                        {pb.name}
                      </CardTitle>
                      <CardDescription className='text-xs'>
                        {pb.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className='space-y-3 pt-0 text-xs'>
                      {pb.params.length > 0 && (
                        <div>
                          <span className='font-medium text-foreground'>
                            {t('playbooks.params')}:
                          </span>
                          <div className='flex flex-wrap gap-1 mt-1'>
                            {pb.params.map((p) => (
                              <Badge
                                key={p.name}
                                variant='secondary'
                                className='font-mono text-[11px]'
                              >
                                {p.name}
                                {p.defaultValue ? `=${p.defaultValue}` : ''}
                                {p.required ? ' *' : ''}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      <div>
                        <span className='font-medium text-foreground'>
                          {t('playbooks.defaultCriteria')}:
                        </span>
                        <ul className='mt-1 space-y-1 list-none'>
                          {pb.defaultCriteria.map((c) => (
                            <li
                              key={`${pb.slug}-${c.checkKind}-${c.text}`}
                              className='flex items-start gap-1.5 text-muted-foreground'
                            >
                              <CheckCircle2 className='h-3 w-3 mt-0.5 text-primary shrink-0' />
                              <span>
                                <span className='font-mono font-medium'>
                                  [{c.checkKind}]
                                </span>{' '}
                                {c.text}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='text-base font-medium'>
              {t('playbooks.historyTitle')}
            </CardTitle>
            <CardDescription>
              {t('playbooks.historyDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {invocationsQuery.isLoading ? (
              <div className='space-y-2'>
                <Skeleton className='h-8 w-full' />
                <Skeleton className='h-8 w-full' />
              </div>
            ) : invocations.length === 0 ? (
              <div className='py-6 text-center text-sm text-muted-foreground'>
                {t('playbooks.noInvocations')}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('playbooks.time')}</TableHead>
                    <TableHead>{t('playbooks.playbook')}</TableHead>
                    <TableHead>{t('playbooks.issue')}</TableHead>
                    <TableHead>{t('playbooks.params')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invocations.map((inv: PlaybookInvocation) => (
                    <TableRow key={inv.id}>
                      <TableCell className='text-xs text-muted-foreground whitespace-nowrap'>
                        {new Date(inv.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant='outline' className='font-mono'>
                          !{inv.playbookSlug}
                        </Badge>
                      </TableCell>
                      <TableCell className='font-mono text-xs'>
                        {inv.issueId}
                      </TableCell>
                      <TableCell className='font-mono text-xs text-muted-foreground'>
                        {Object.keys(inv.params).length > 0
                          ? JSON.stringify(inv.params)
                          : '—'}
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
