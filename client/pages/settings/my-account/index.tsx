/**
 * Settings → My account: the signed-in person's own profile, password and personal API keys. Everyone signed in may open
 * it (`authz: 'skip'`, like My notifications): it only ever acts on their own account, through the Better Auth client, and
 * the server decides again on every call.
 */
import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';

import { ApiKeysCard } from './api-keys-card.js';
import { PasswordCard } from './password-card.js';
import { ProfileCard } from './profile-card.js';

export default function MyAccountPage(): ReactElement {
  const { t } = useTranslation();
  return (
    <PageContainer>
      <PageHeader
        title={t('myAccount.title')}
        description={t('myAccount.description')}
      />
      <div className='flex max-w-3xl flex-col gap-6'>
        <ProfileCard />
        <PasswordCard />
        <ApiKeysCard />
      </div>
    </PageContainer>
  );
}
