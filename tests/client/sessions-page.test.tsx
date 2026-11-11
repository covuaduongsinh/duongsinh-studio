// My sessions: the list filtered in the browser (needs me, in progress), the real status of the issues a session is
// tied to, what is unread, and the panel beside the conversation (issues, session facts, usage).
import { apiClientToken } from '@nocobase/app-client';
import {
  AuthenticationProvider,
  authenticationClientToken,
} from '@nocobase/app-plugin-authentication/client';
import {
  AuthorizationClient,
  authorizationClientToken,
} from '@nocobase/app-plugin-authorization/client';
import projects from '@nocobase/app-plugin-projects/client';
import {
  answerApi,
  renderWithApp,
  type ApiCall,
} from '@nocobase/app-testing/client';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import packageMetadata from '../../package.json' with { type: 'json' };
import enUS from '../../client/locales/en-US.js';
import SessionsPage from '../../client/pages/sessions/index.js';

vi.mock('#extensions/nocobase-agent-chat/conversation-view', () => ({
  ConversationView: ({ conversationId }: { conversationId: string | null }) => (
    <div data-testid='conversation-view'>{conversationId}</div>
  ),
}));

vi.mock('#extensions/nocobase-agent-chat/agent-status', () => ({
  AgentLine: ({
    conversation,
  }: {
    conversation: { agent: { name: string } };
  }) => <span>{conversation.agent.name}</span>,
}));
vi.mock('#extensions/nocobase-agent-chat/panel-header', () => ({
  ConversationTitle: ({ shown }: { shown: string }) => <h1>{shown}</h1>,
}));
vi.mock('#extensions/nocobase-agent-chat/chat-i18n', () => ({
  useChatTranslation: () => ({ t: (key: string) => key }),
}));

const AT = new Date().toISOString();

// The agents plugin's conversation hooks need its whole client (catalog, realtime): they answer from the fixture below
// while the page's own parts (filters, panel, usage, issue statuses) stay real.
vi.mock('@nocobase/app-plugin-agents/client/chat', async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import('@nocobase/app-plugin-agents/client/chat')
    >();
  const { useApiClient } = await import('@nocobase/app-client');
  return {
    ...original,
    useChatPanel: () => ({}),
    useChatPageTracking: () => null,
    useConversationList: () => ({
      isPending: false,
      data: { pages: [{ items: sessionsFixture() }] },
    }),
    useConversation: (id: string) => ({
      data: sessionsFixture().find((item) => item.id === id) ?? null,
    }),
    useConversationActions: () => ({ archive: { mutate: () => undefined } }),
    useChatApi: () => {
      const api = useApiClient();
      return {
        usage: async (id: string, signal?: AbortSignal) =>
          (
            await api.request<{ data: unknown }>({
              path: `agents/conversations/${id}/usage`,
              signal,
            })
          ).data,
      };
    },
  };
});
function sessionsFixture() {
  return sessions;
}
const agent = { id: 'a1', name: 'Claude', nameText: 'Claude', avatar: null };

const conversation = (id: string, extra: Record<string, unknown>) => ({
  id,
  title: `Session ${id}`,
  titleSource: 'user',
  category: 'chat',
  showInChatList: true,
  source: 'panel',
  mode: 'runner',
  agent,
  links: [],
  projectId: null,
  execution: { status: 'idle' },
  read: true,
  lastMessageAt: AT,
  updatedAt: AT,
  createdAt: AT,
  archivedAt: null,
  lastSeq: 4,
  seenSeq: 4,
  needsYou: null,
  ...extra,
});

const link = (id: string, targetId: string) => ({
  id,
  conversationId: 'c1',
  kind: 'issue',
  targetId,
  origin: 'agent',
  createdAt: AT,
  // The words of the label say nothing here: the status comes from the issue itself.
  view: {
    key: `PM-${targetId}`,
    title: 'Something',
    status: 'Doing',
    url: null,
  },
});

const sessions = [
  conversation('c1', {
    links: [link('l1', '11'), link('l2', '12')],
    execution: { status: 'running' },
    projectId: 'p1',
  }),
  conversation('c2', {
    needsYou: { reason: 'confirm', seq: 5, text: 'Shall I merge?' },
    lastSeq: 9,
    seenSeq: 5,
  }),
  conversation('c3', {}),
];

const getSession = vi.fn(async () => ({ data: null }));

const api = vi.fn((call: ApiCall): unknown => {
  const { method, path } = call;
  if (method === 'GET' && path === 'authorization/permissions')
    return { data: { unrestricted: true, permissions: [] } };
  if (method === 'GET' && path === 'agents/conversations')
    return { data: sessions, meta: {} };
  if (method === 'GET' && path === 'agents/conversations/c1')
    return { data: sessions[0] };
  if (method === 'GET' && path === 'agents/conversations/c1/usage')
    return {
      data: {
        inputTokens: 1200,
        cacheReadTokens: 300,
        outputTokens: 450,
        runs: 2,
        context: null,
        costUsd: 0.42,
      },
    };
  if (method === 'GET' && path === 'projects/issues/summaries')
    return {
      data: [
        {
          id: '11',
          identifier: 'PM-11',
          title: 'Finished work',
          statusKey: 'done',
        },
        {
          id: '12',
          identifier: 'PM-12',
          title: 'Open work',
          statusKey: 'in_progress',
        },
      ],
    };
  if (method === 'GET' && path === 'projects')
    return { data: [{ id: 'p1', name: 'Studio Platform' }] };
  if (method === 'GET' && path === 'projects/me')
    return {
      data: {
        userId: 'u1',
        name: 'Ada',
        permissions: { scopes: {}, settings: {} },
        kinds: [],
      },
    };
  return { data: [] };
});

async function renderPage(route = '/sessions') {
  return renderWithApp(
    <AuthenticationProvider>
      <Routes>
        <Route path='/sessions' element={<SessionsPage />} />
        <Route path='/sessions/:conversationId' element={<SessionsPage />} />
      </Routes>
    </AuthenticationProvider>,
    {
      route,
      namespace: packageMetadata.name,
      namespaces: { [packageMetadata.name]: enUS },
      plugins: [projects({ routes: false, realtime: false })],
      fetch: answerApi(api),
      services: (app) => {
        app.container.instance(authenticationClientToken, { getSession });
        app.container.singleton(
          authorizationClientToken,
          (resolver) =>
            new AuthorizationClient(resolver.resolve(apiClientToken)),
        );
      },
    },
  );
}

const calls = (path: string): ApiCall[] =>
  api.mock.calls.map(([call]) => call).filter((call) => call.path === path);

describe('my sessions', () => {
  beforeEach(() => {
    api.mockClear();
  });

  it('draws what is tied to a session from the issues themselves, and marks what is unread', async () => {
    await renderPage();
    await screen.findByText('Session c1');
    // One request names every issue the listed sessions link; the figure follows the real statuses (1 done of 2).
    await waitFor(() =>
      expect(calls('projects/issues/summaries')).not.toHaveLength(0),
    );
    expect(
      await screen.findByText(
        enUS.sessions.issues.progress
          .replace('{{completed}}', '1')
          .replace('{{total}}', '2'),
      ),
    ).toBeInTheDocument();
    // c2 holds messages the person has not read; the others do not.
    expect(
      screen.getAllByRole('img', { name: enUS.sessions.unread }),
    ).toHaveLength(1);
    expect(screen.getByText(enUS.sessions.needsYou)).toBeInTheDocument();
  });

  it('filters in the browser: needs me counts and keeps the address; in progress follows the execution', async () => {
    const user = userEvent.setup();
    await renderPage();
    await screen.findByText('Session c1');
    const listCalls = calls('agents/conversations').length;

    await user.click(
      screen.getByRole('tab', {
        name: new RegExp(`^${enUS.sessions.tabs.needsMe}`),
      }),
    );
    expect(screen.getByRole('tab', { name: /1$/ })).toBeInTheDocument();
    expect(screen.queryByText('Session c1')).toBeNull();
    expect(screen.getByText('Session c2')).toBeInTheDocument();

    await user.click(
      screen.getByRole('tab', { name: enUS.sessions.tabs.inProgress }),
    );
    expect(screen.getByText('Session c1')).toBeInTheDocument();
    expect(screen.queryByText('Session c2')).toBeNull();
    // No new request: the list was filtered where it is.
    expect(calls('agents/conversations')).toHaveLength(listCalls);
  });

  it('shows the issues, the session and its usage beside the conversation, and the project at its head', async () => {
    await renderPage('/sessions/c1');
    const panel = await screen.findByRole('complementary', {
      name: enUS.sessions.panel.label,
    });
    const issues = within(panel).getByRole('region', {
      name: enUS.sessions.panel.issues,
    });
    expect(await within(issues).findByText('Open work')).toBeInTheDocument();
    expect(within(issues).getByText('Finished work')).toBeInTheDocument();
    const usage = within(panel).getByRole('region', {
      name: enUS.sessions.panel.usage,
    });
    expect(await within(usage).findByText('1,200')).toBeInTheDocument();
    expect(within(usage).getByText('$0.42')).toBeInTheDocument();
    expect(
      (await screen.findAllByText('Studio Platform')).length,
    ).toBeGreaterThan(0);
  });
});
