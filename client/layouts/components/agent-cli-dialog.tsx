/**
 * "Use Studio in your agent": how a coding agent on the person's own machine reaches this Studio through the
 * application's CLI. The install line is the agents plugin's own (`curl … | sh -s -- --token <token>`, a download token
 * any signed-in person may mint, valid for 30 minutes); signing in is `ds-studio login`, after which the agent runs as
 * the person. A personal API key (My account) is the alternative for machines where nobody signs in.
 */
import { copyText, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useMutation } from '@tanstack/react-query';
import { CopyIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import { Link, useHref } from 'react-router';

import { Button } from '#components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';

/** The CLI's name (`nocobase.cli.bin` in `package.json`). */
const CLI = 'ds-studio';
const INSTALL_SCRIPT = '/api/agents/dist/installScript';

const quote = (value: string): string =>
  /^[\w@%+=:,./-]+$/u.test(value)
    ? value
    : `'${value.replaceAll("'", `'"'"'`)}'`;

function Command({
  label,
  command,
}: {
  readonly label: string;
  readonly command: string;
}): ReactElement {
  const { t } = useTranslation();
  const toaster = useToaster();
  return (
    <div className='flex flex-col gap-1.5'>
      <span className='text-sm font-medium'>{label}</span>
      <div className='flex items-start gap-2 rounded-md border bg-muted/40 p-2'>
        <code className='min-w-0 flex-1 break-all text-xs'>{command}</code>
        <Button
          type='button'
          size='icon-sm'
          variant='ghost'
          aria-label={t('agentCli.copy', { what: label })}
          onClick={() => {
            copyText(command)
              .then((copied) =>
                toaster.show(
                  copied
                    ? { type: 'success', title: t('agentCli.copied') }
                    : { type: 'error', title: t('agentCli.copyFailed') },
                ),
              )
              .catch(() => undefined);
          }}
        >
          <CopyIcon />
        </Button>
      </div>
    </div>
  );
}

export function AgentCliDialog({
  open,
  onOpenChange,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const base = `${window.location.origin}${useHref('/').replace(/\/+$/u, '')}`;
  const mint = useMutation({
    mutationFn: async () =>
      (
        await api.request<{ data: { token: string } }>({
          path: 'agents/dist/downloadTokens',
          method: 'POST',
          json: {},
        })
      ).data,
    onError: () => toaster.show({ type: 'error', title: t('agentCli.failed') }),
  });
  const install = mint.data
    ? `curl -fsSL ${quote(`${base}${INSTALL_SCRIPT}`)} | sh -s -- --token ${quote(mint.data.token)}`
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('agentCli.title')}</DialogTitle>
          <DialogDescription>{t('agentCli.description')}</DialogDescription>
        </DialogHeader>
        <div className='flex flex-col gap-4'>
          {install ? (
            <Command label={t('agentCli.install')} command={install} />
          ) : (
            <Button
              type='button'
              disabled={mint.isPending}
              onClick={() => mint.mutate()}
            >
              {t('agentCli.create')}
            </Button>
          )}
          <Command
            label={t('agentCli.login')}
            command={`${CLI} login --server ${quote(base)}`}
          />
          <p className='text-sm text-muted-foreground'>
            {t('agentCli.keyHint')}{' '}
            <Link
              to='/settings/my-account'
              className='underline underline-offset-4'
              onClick={() => onOpenChange(false)}
            >
              {t('agentCli.myAccount')}
            </Link>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
