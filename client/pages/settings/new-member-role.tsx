/**
 * Settings → New members: the role a person is given, once, when they join through an invitation, and who holds it now.
 * It is not a grant to everyone: changing it later does not touch people already admitted, and with no role set a new member
 * joins their projects but sees no work yet. Reading needs `pm.members` read; changing it `define-roles`.
 */
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '#components/ui/card';
import { Label } from '#components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { Skeleton } from '#components/ui/skeleton';
import {
  useAccessMembers,
  useAccessRoles,
  useAccessSettings,
  useSaveDefaultRole,
  type AccessMember,
  type AccessRole,
  type RoleTitle,
} from '#hooks/use-access';

/** The owner role is never the default: it is the one that holds every permission. */
const OWNER_ROLE = 'owner';
const NONE = '__none__';
/** How many names are listed before "and N more". */
const SHOWN = 12;

type Translate = ReturnType<typeof useTranslation>['t'];

const titleOf = (t: Translate, role: AccessRole): string => {
  const title: RoleTitle | null = role.title;
  if (title === null) return role.key;
  return typeof title === 'string' ? title : t(title.key, { ns: title.ns });
};

function Holders({
  role,
  members,
  total,
}: {
  readonly role: AccessRole | undefined;
  readonly members: readonly AccessMember[];
  readonly total: number;
}): ReactElement | null {
  const { t } = useTranslation();
  if (!role) return null;
  const holders = members.filter((member) =>
    role.holderIds.includes(member.userId),
  );
  if (role.holderCount === 0)
    return (
      <p className='text-sm text-muted-foreground'>
        {t('newMemberRole.nobody')}
      </p>
    );
  return (
    <div className='flex flex-col gap-2' data-testid='role-holders'>
      <p className='text-sm text-muted-foreground'>
        {t('newMemberRole.holders', { count: role.holderCount })}
      </p>
      <ul className='flex flex-wrap gap-2 text-sm'>
        {holders.slice(0, SHOWN).map((member) => (
          <li
            key={member.userId}
            className={
              member.disabled
                ? 'rounded-md bg-muted px-2 py-1 text-muted-foreground line-through'
                : 'rounded-md bg-muted px-2 py-1'
            }
          >
            {member.name}
          </li>
        ))}
        {role.holderCount > Math.min(holders.length, SHOWN) ? (
          <li className='px-2 py-1 text-muted-foreground'>
            {t('newMemberRole.more', {
              count: role.holderCount - Math.min(holders.length, SHOWN),
            })}
          </li>
        ) : null}
      </ul>
      {total > members.length ? (
        <p className='text-xs text-muted-foreground'>
          {t('newMemberRole.partial', { shown: members.length, total })}
        </p>
      ) : null}
    </div>
  );
}

export default function NewMemberRolePage(): ReactElement {
  const { t } = useTranslation();
  const { can: mayRead } = useCan({
    resource: { type: 'settings', id: 'pm.members' },
    action: 'read',
  });
  const { can: mayDefine } = useCan({
    resource: { type: 'settings', id: 'pm.members' },
    action: 'define-roles',
  });
  const settings = useAccessSettings(mayRead);
  const roles = useAccessRoles(mayRead);
  const members = useAccessMembers(mayRead);
  const save = useSaveDefaultRole();
  // What the person picked; until then what the server says.
  const [picked, setPicked] = useState<string | null | undefined>(undefined);

  if (!mayRead)
    return (
      <PageContainer>
        <PageHeader title={t('newMemberRole.title')} />
        <Alert>
          <AlertDescription>{t('newMemberRole.notAllowed')}</AlertDescription>
        </Alert>
      </PageContainer>
    );

  const saved = settings.data?.defaultRole ?? null;
  const current = picked === undefined ? saved : picked;
  const choices = (roles.data ?? []).filter((role) => role.key !== OWNER_ROLE);
  const items = [
    { value: NONE, label: t('newMemberRole.noRole') },
    ...choices.map((role) => ({ value: role.key, label: titleOf(t, role) })),
  ];
  const changed = current !== saved;
  const loading = settings.isPending || roles.isPending || members.isPending;

  return (
    <PageContainer>
      <PageHeader
        title={t('newMemberRole.title')}
        description={t('newMemberRole.description')}
      />
      {loading ? <Skeleton className='h-40 w-full' /> : null}
      {settings.isError || roles.isError || members.isError ? (
        <Alert variant='destructive'>
          <AlertDescription>{t('newMemberRole.failed')}</AlertDescription>
        </Alert>
      ) : null}
      {settings.data && roles.data && members.data ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('newMemberRole.cardTitle')}</CardTitle>
          </CardHeader>
          <CardContent className='flex flex-col gap-4'>
            {current === null ? (
              <Alert>
                <AlertDescription>
                  {t('newMemberRole.noneHint')}
                </AlertDescription>
              </Alert>
            ) : null}
            <div className='grid max-w-sm gap-2'>
              <Label htmlFor='new-member-role'>
                {t('newMemberRole.label')}
              </Label>
              <Select
                value={current ?? NONE}
                items={items}
                disabled={!mayDefine}
                onValueChange={(value) =>
                  setPicked(!value || value === NONE ? null : value)
                }
              >
                <SelectTrigger id='new-member-role'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {items.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Holders
              role={choices.find((role) => role.key === current)}
              members={members.data.members}
              total={members.data.total}
            />
            <p className='text-sm text-muted-foreground'>
              {t('newMemberRole.onceHint')}
            </p>
            {save.isError ? (
              <Alert variant='destructive'>
                <AlertDescription>{save.error.message}</AlertDescription>
              </Alert>
            ) : null}
            {save.isSuccess && !changed ? (
              <Alert>
                <AlertDescription>{t('newMemberRole.saved')}</AlertDescription>
              </Alert>
            ) : null}
            {mayDefine ? (
              <div>
                <Button
                  disabled={!changed || save.isPending}
                  onClick={() =>
                    save.mutate(current, {
                      onSuccess: () => setPicked(undefined),
                    })
                  }
                >
                  {t('newMemberRole.save')}
                </Button>
              </div>
            ) : (
              <p className='text-sm text-muted-foreground'>
                {t('newMemberRole.readOnly')}
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}
    </PageContainer>
  );
}
