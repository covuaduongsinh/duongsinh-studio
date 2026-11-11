import { useTranslation } from '@nocobase/i18n/client';
import { ShieldAlertIcon, CheckCircle2Icon, EyeOffIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import { Alert, AlertDescription, AlertTitle } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { useSecretFindings } from '#hooks/use-secret-findings';

export interface SecretFindingsBannerProps {
  readonly issueId: string;
}

export function SecretFindingsBanner({
  issueId,
}: SecretFindingsBannerProps): ReactElement | null {
  const { t } = useTranslation();
  const { findings, updateStatus } = useSecretFindings(issueId);

  const activeFindings = findings.filter(
    (finding) => finding.status === 'active',
  );

  if (activeFindings.length === 0) {
    return null;
  }

  return (
    <Alert
      variant='destructive'
      data-testid='secret-findings-banner'
      className='border-destructive/50 bg-destructive/10 text-destructive'
    >
      <ShieldAlertIcon className='size-5 text-destructive' />
      <div className='flex flex-col gap-2'>
        <AlertTitle className='font-semibold tracking-tight text-destructive flex items-center gap-2'>
          <span>{t('secretFindings.bannerTitle')}</span>
          <span className='rounded-full bg-destructive/20 px-2 py-0.5 text-xs font-mono font-medium text-destructive'>
            {activeFindings.length}
          </span>
        </AlertTitle>
        <AlertDescription className='text-xs text-destructive/90'>
          {t('secretFindings.bannerDescription')}
        </AlertDescription>

        <div className='mt-2 flex flex-col gap-2'>
          {activeFindings.map((finding) => (
            <div
              key={finding.id}
              data-testid={`secret-finding-item-${finding.id}`}
              className='flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/20 bg-background/80 p-2 text-foreground'
            >
              <div className='flex items-center gap-2 text-xs'>
                <span className='text-muted-foreground'>
                  {t('secretFindings.detectedPattern')}
                </span>
                <code className='rounded bg-muted px-1.5 py-0.5 font-mono font-semibold text-foreground'>
                  {finding.patternKey}
                </code>
              </div>

              <div className='flex items-center gap-1.5'>
                <Button
                  type='button'
                  size='sm'
                  variant='outline'
                  className='h-7 text-xs'
                  disabled={updateStatus.isPending}
                  onClick={() =>
                    updateStatus.mutate({
                      findingId: finding.id,
                      status: 'resolved',
                    })
                  }
                >
                  <CheckCircle2Icon className='mr-1 size-3.5 text-emerald-600' />
                  {t('secretFindings.resolve')}
                </Button>

                <Button
                  type='button'
                  size='sm'
                  variant='ghost'
                  className='h-7 text-xs text-muted-foreground hover:text-foreground'
                  disabled={updateStatus.isPending}
                  onClick={() =>
                    updateStatus.mutate({
                      findingId: finding.id,
                      status: 'ignored',
                    })
                  }
                >
                  <EyeOffIcon className='mr-1 size-3.5' />
                  {t('secretFindings.ignore')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Alert>
  );
}
