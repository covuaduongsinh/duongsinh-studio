// The header's My sessions and Inbox shortcuts, each with what waits for the person.
import {
  answerApi,
  renderWithApp,
  type ApiCall,
} from '@nocobase/app-testing/client';
import { screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import enUS from '../../client/locales/en-US.js';
import { HeaderQuickLinks } from '../../client/layouts/components/header-quick-links.js';
import packageMetadata from '../../package.json' with { type: 'json' };

const answer = (call: ApiCall): unknown => {
  if (call.path === 'inbox/pending') return { data: { decision: 2, info: 1 } };
  if (call.path === 'agents/conversationAttention')
    return { data: { needsYou: 1, unread: 4 } };
  return new Response(null, { status: 404 });
};

it('links to My sessions and the Inbox with the numbers that wait', async () => {
  await renderWithApp(<HeaderQuickLinks />, {
    namespace: packageMetadata.name,
    namespaces: { [packageMetadata.name]: enUS },
    fetch: answerApi(answer),
  });
  const sessions = await screen.findByRole('link', {
    name: `${enUS.navigation.mySessions} (1)`,
  });
  expect(sessions).toHaveAttribute('href', '/sessions');
  const inbox = await screen.findByRole('link', {
    name: `${enUS.navigation.inbox} (3)`,
  });
  expect(inbox).toHaveAttribute('href', '/inbox');
});
