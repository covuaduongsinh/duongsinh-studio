// `/knowledge` with Studio's directory (`server/routes/kb.ts`) answered by the fixture below: the shared space and a
// project's space are listed from `/api/knowledgeDirectory`, and the directory's search goes to its search route.
import { apiClientToken } from '@nocobase/app-client';
import {
  AuthenticationProvider,
  authenticationClientToken,
} from '@nocobase/app-plugin-authentication/client';
import {
  AuthorizationClient,
  authorizationClientToken,
} from '@nocobase/app-plugin-authorization/client';
import knowledge from '@nocobase/app-plugin-knowledge/client';
import {
  answerApi,
  renderWithApp,
  type ApiCall,
} from '@nocobase/app-testing/client';
import { screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import packageMetadata from '../../package.json' with { type: 'json' };
import enUS from '../../client/locales/en-US.js';
import {
  SYSTEM_SPACE,
  useKnowledgeDirectory,
} from '../../client/hooks/use-knowledge-directory.js';
import KnowledgePage from '../../client/pages/knowledge/index.js';

const AT = new Date().toISOString();
const space = (scope: string, scopeId: string, title: string) => ({
  scope,
  scopeId,
  title,
  access: {
    read: true,
    propose: true,
    edit: scope === 'system',
    manage: scope === 'system',
  },
  inherited: false,
});
const getSession = vi.fn(async () => ({ data: null }));

const api = vi.fn((call: ApiCall): unknown => {
  const { method, path } = call;
  if (method === 'GET' && path === 'authorization/permissions')
    return { data: { unrestricted: true, permissions: [] } };
  if (method === 'GET' && path === 'knowledgeDirectory')
    return {
      data: [
        {
          space: space('system', '', 'Dương Sinh'),
          documents: 2,
          archivedDocuments: 0,
        },
        {
          space: space('project', 'p1', 'Dương Sinh NocoBase'),
          documents: 1,
          archivedDocuments: 0,
        },
      ],
    };
  if (method === 'GET' && path === 'knowledgeDirectory/search')
    return {
      data: [
        {
          docId: 'd1',
          kind: 'article',
          slug: 'quy-trinh-merge',
          title: 'Quy trình merge',
          version: 1,
          scope: 'system',
          scopeId: '',
          inherited: false,
          headingPath: [],
          anchor: null,
          lines: [1, 3],
          excerpt: 'Chủ dự án merge PR sau khi CI xanh.',
          titleMatch: true,
          updatedAt: AT,
          score: 1,
        },
      ],
    };
  if (method === 'GET' && path === 'knowledge/capabilities')
    return { data: { semanticSearch: false, proposals: true } };
  if (method === 'GET' && path === 'knowledge/tree')
    return {
      data: {
        spaces: [{ space: space('system', '', 'Dương Sinh'), docs: [] }],
      },
    };
  if (method === 'GET' && path === 'knowledge/proposals')
    return { data: [], meta: { total: 0, page: 1, pageSize: 20 } };
  return new Response(null, { status: 404 });
});

function render(ui: ReactElement) {
  return renderWithApp(<AuthenticationProvider>{ui}</AuthenticationProvider>, {
    namespace: packageMetadata.name,
    namespaces: { [packageMetadata.name]: enUS },
    plugins: [knowledge({ routes: false })],
    fetch: answerApi(api),
    services: (app) => {
      app.container.instance(authenticationClientToken, { getSession });
      app.container.singleton(
        authorizationClientToken,
        (resolver) => new AuthorizationClient(resolver.resolve(apiClientToken)),
      );
    },
  });
}

describe('knowledge page', () => {
  beforeEach(() => {
    api.mockClear();
  });

  it('lists the shared space and the projects the viewer sees from Studio’s directory', async () => {
    render(<KnowledgePage />);
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: enUS.knowledge.title,
      }),
    ).toBeTruthy();
    await waitFor(() =>
      expect(
        api.mock.calls.some(([call]) => call.path === 'knowledgeDirectory'),
      ).toBe(true),
    );
    expect(await screen.findByText('Dương Sinh NocoBase')).toBeTruthy();
  });

  it('searches every authorized space through the directory’s search route', async () => {
    let source: ReturnType<typeof useKnowledgeDirectory> | undefined;
    function Probe() {
      source = useKnowledgeDirectory();
      return null;
    }
    render(<Probe />);
    await waitFor(() => expect(source).toBeDefined());
    expect(source?.sharedScope).toBe(SYSTEM_SPACE.scope);
    expect(source?.sharedLabel).toBe(enUS.knowledge.shared);
    const hits = await source?.search('merge');
    expect(hits?.map((hit) => hit.docId)).toEqual(['d1']);
    const searched = api.mock.calls.find(
      ([call]) => call.path === 'knowledgeDirectory/search',
    )?.[0];
    expect(searched?.query).toMatchObject({ q: 'merge' });
  });
});
