/**
 * Studio's authorized knowledge directory (`server/routes/kb.ts`): the spaces the viewer reads, the shared system space
 * and the spaces of the projects they see, with their document counts, and a search over all of them.
 */
import { useApiClient } from '@nocobase/app-client';
import type { KnowledgeDirectorySource } from '@nocobase/app-plugin-knowledge/client/pages';
import { useTranslation } from '@nocobase/i18n/client';
import { useMemo } from 'react';

/** The shared space every project space inherits (`server/knowledge/access.ts`). */
export const SYSTEM_SPACE = { scope: 'system', scopeId: '' } as const;

type Summaries = Awaited<ReturnType<KnowledgeDirectorySource['summaries']>>;
type Hits = Awaited<ReturnType<KnowledgeDirectorySource['search']>>;

export function useKnowledgeDirectory(): KnowledgeDirectorySource {
  const api = useApiClient();
  const { t } = useTranslation();
  return useMemo(
    () => ({
      sharedScope: SYSTEM_SPACE.scope,
      sharedLabel: t('knowledge.shared'),
      summaries: async (signal) =>
        (
          await api.request<{ data: Summaries }>({
            path: 'knowledgeDirectory',
            signal,
          })
        ).data,
      search: async (query, signal) => [
        ...(
          await api.request<{ data: Hits }>({
            path: 'knowledgeDirectory/search',
            query: { q: query },
            signal,
          })
        ).data,
      ],
    }),
    [api, t],
  );
}
