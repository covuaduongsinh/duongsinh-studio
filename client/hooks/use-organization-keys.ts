/** The organization's API keys (`server/routes/organization-keys.ts`). */
import { useApiClient } from '@nocobase/app-client';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

export type KeyLevel = 'read' | 'write' | 'admin';
export type KeyGroups = Readonly<Record<string, { readonly level: KeyLevel }>>;
export type LocalizedText =
  string | { readonly key: string; readonly ns: string };

export interface OrganizationKey {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly scope: { readonly groups: KeyGroups } | null;
  readonly start: string | null;
  readonly createdBy: { readonly id: string; readonly name: string } | null;
  readonly createdAt: string;
  readonly expiresAt: string | null;
  readonly lastUsedAt: string | null;
  readonly status: 'active' | 'disabled' | 'expired';
}

export interface KeyScopeGroup {
  readonly id: string;
  readonly title: LocalizedText;
  readonly levels: readonly KeyLevel[];
  readonly held: Readonly<Partial<Record<KeyLevel, boolean>>>;
}

export interface KeyScopeOptions {
  readonly groups: readonly KeyScopeGroup[];
  readonly defaultExpiresInDays: number;
}

export interface CreatedKey {
  readonly key: OrganizationKey;
  readonly secret: string;
}

const KEYS = ['organization-keys'] as const;

export function useOrganizationKeys(): UseQueryResult<
  readonly OrganizationKey[]
> {
  const api = useApiClient();
  return useQuery({
    queryKey: KEYS,
    queryFn: async ({ signal }) =>
      (
        await api.request<{ data: OrganizationKey[] }>({
          path: 'organizationKeys',
          signal,
        })
      ).data,
  });
}

export function useKeyScopeOptions(
  enabled: boolean,
): UseQueryResult<KeyScopeOptions> {
  const api = useApiClient();
  return useQuery({
    queryKey: [...KEYS, 'scope-options'],
    enabled,
    queryFn: async ({ signal }) =>
      (
        await api.request<{ data: KeyScopeOptions }>({
          path: 'organizationKeys/scopeOptions',
          signal,
        })
      ).data,
  });
}

export function useCreateOrganizationKey(): UseMutationResult<
  CreatedKey,
  unknown,
  {
    readonly name: string;
    readonly expiresInDays: number | null;
    readonly scope: { readonly groups: KeyGroups };
  }
> {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (json) =>
      (
        await api.request<{ data: CreatedKey }>({
          method: 'POST',
          path: 'organizationKeys',
          json,
        })
      ).data,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: KEYS });
    },
  });
}

/** What a row's buttons do; rotating answers the new secret. */
export function useOrganizationKeyAction(): UseMutationResult<
  CreatedKey | null,
  unknown,
  {
    readonly keyId: string;
    readonly action: 'rotate' | 'disable' | 'enable' | 'delete';
  }
> {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ action, keyId }) => {
      if (action === 'delete') {
        await api.request({
          method: 'DELETE',
          path: `organizationKeys/${keyId}`,
        });
        return null;
      }
      const answer = await api.request<{ data: CreatedKey }>({
        method: 'POST',
        path: `organizationKeys/${keyId}/${action}`,
        json: {},
      });
      return action === 'rotate' ? answer.data : null;
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: KEYS });
    },
  });
}
