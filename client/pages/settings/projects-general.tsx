import { useToaster } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { GeneralSettings } from '@nocobase/app-plugin-projects/client/config';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertOctagonIcon, LoaderCircle } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
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
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import { Field, FieldLabel } from '#components/ui/field';
import { Input } from '#components/ui/input';
import { useStopAllAutopilot } from '#hooks/use-autopilot';

function EmergencyStopAutopilotSection(): ReactElement {
  const { t } = useTranslation();
  const toaster = useToaster();
  const stopAll = useStopAllAutopilot();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [confirmWord, setConfirmWord] = useState('');

  const handleConfirm = (): void => {
    if (confirmWord !== 'STOP' || !reason.trim()) return;
    stopAll.mutate(
      { reason: reason.trim() },
      {
        onSuccess: () => {
          setOpen(false);
          setReason('');
          setConfirmWord('');
          toaster.show({
            type: 'success',
            title: t('autopilot.emergencyStop.successTitle'),
            description: t('autopilot.emergencyStop.successDescription'),
          });
        },
        onError: (err) => {
          toaster.show({
            type: 'error',
            title: t('autopilot.emergencyStop.errorTitle'),
            description: err instanceof Error ? err.message : String(err),
          });
        },
      },
    );
  };

  return (
    <>
      <Card className='border-destructive/40 bg-destructive/5 mt-6'>
        <CardHeader>
          <div className='flex items-center gap-2'>
            <AlertOctagonIcon className='size-5 text-destructive' />
            <CardTitle className='text-destructive'>
              {t('autopilot.emergencyStop.cardTitle')}
            </CardTitle>
          </div>
          <CardDescription>
            {t('autopilot.emergencyStop.cardDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant='destructive'
            onClick={() => setOpen(true)}
            className='font-medium'
          >
            <AlertOctagonIcon className='mr-1.5 size-4' />
            {t('autopilot.emergencyStop.buttonLabel')}
          </Button>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className='text-destructive flex items-center gap-2'>
              <AlertOctagonIcon className='size-5' />
              {t('autopilot.emergencyStop.dialogTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('autopilot.emergencyStop.dialogDescription')}
            </DialogDescription>
          </DialogHeader>

          <div className='space-y-4 py-2'>
            <Field>
              <FieldLabel>
                {t('autopilot.emergencyStop.reasonLabel')}
              </FieldLabel>
              <Input
                placeholder={t('autopilot.emergencyStop.reasonPlaceholder')}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                autoFocus
              />
            </Field>

            <Field>
              <FieldLabel>
                {t('autopilot.emergencyStop.confirmLabel', { word: 'STOP' })}
              </FieldLabel>
              <Input
                placeholder='STOP'
                value={confirmWord}
                onChange={(e) => setConfirmWord(e.target.value)}
                className='font-mono uppercase'
              />
            </Field>
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant='outline' />}>
              {t('common.cancel')}
            </DialogClose>
            <Button
              variant='destructive'
              onClick={handleConfirm}
              disabled={
                confirmWord !== 'STOP' || !reason.trim() || stopAll.isPending
              }
            >
              {stopAll.isPending && (
                <LoaderCircle className='mr-1.5 size-4 animate-spin' />
              )}
              {t('autopilot.emergencyStop.confirmButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * The projects plugin's issue prefix setting, routed under the application's settings. The plugin's section brings
 * its own heading and form; the page supplies the container and the page title.
 */
export default function ProjectsGeneralSettingsPage(): ReactElement {
  const { t } = useTranslation();
  // The server lets only an unrestricted administrator stop autopilot everywhere; the card is shown to no one else.
  const { can: unrestricted } = useCan('unrestricted');
  return (
    <PageContainer>
      <PageHeader
        title={t('projectSettings.generalTitle')}
        description={t('projectSettings.generalDescription')}
      />
      <GeneralSettings />
      {unrestricted ? <EmergencyStopAutopilotSection /> : null}
    </PageContainer>
  );
}
