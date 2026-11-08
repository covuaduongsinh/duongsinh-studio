/** Studio's roles, members and the role a new member is given (`server/routes/access.ts`, `/api/access/*`). */
import { useApiClient } from '@nocobase/app-client';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

/** A title is plain text or a reference to a translation of the application. */
export type RoleTitle = string | { readonly key: string; readonly ns: string };

export interface AccessRole {
  readonly key: string;
  readonly title: RoleTitle | null;
  readonly builtIn: boolean;
  /** Users assigned the role directly. */
  readonly holderIds: readonly string[];
  readonly holderCount: number;
}

export interface AccessMember {
  readonly userId: string;
  readonly name: string;
  readonly disabled: boolean;
  readonly roles: readonly string[];
}

export interface AccessSettings {
  readonly defaultRole: string | null;
}

const ACCESS = ['access'] as const;

export function useAccessSettings(
  enabled: boolean,
): UseQueryResult<AccessSettings> {
  const api = useApiClient();
  return useQuery({
    queryKey: [...ACCESS, 'settings'],
    enabled,
    queryFn: async ({ signal }) =>
      (
        await api.request<{ data: AccessSettings }>({
          path: 'access/settings',
          signal,
        })
      ).data,
  });
}

export function useAccessRoles(
  enabled: boolean,
): UseQueryResult<readonly AccessRole[]> {
  const api = useApiClient();
  return useQuery({
    queryKey: [...ACCESS, 'roles'],
    enabled,
    queryFn: async ({ signal }) =>
      (
        await api.request<{ data: readonly AccessRole[] }>({
          path: 'access/roles',
          signal,
        })
      ).data,
  });
}

/** Up to the first 100 people, which is every person Studio is likely to have; the page says when there are more. */
export function useAccessMembers(
  enabled: boolean,
): UseQueryResult<{ members: readonly AccessMember[]; total: number }> {
  const api = useApiClient();
  return useQuery({
    queryKey: [...ACCESS, 'members'],
    enabled,
    queryFn: async ({ signal }) => {
      const answer = await api.request<{
        data: readonly AccessMember[];
        meta?: { total?: number };
      }>({ path: 'access/members', query: { pageSize: 100 }, signal });
      return {
        members: answer.data,
        total: answer.meta?.total ?? answer.data.length,
      };
    },
  });
}

export function useSaveDefaultRole(): UseMutationResult<
  AccessSettings,
  Error,
  string | null
> {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (defaultRole: string | null) =>
      (
        await api.request<{ data: AccessSettings }>({
          path: 'access/settings',
          method: 'PUT',
          json: { defaultRole },
        })
      ).data,
    onSuccess: (saved) =>
      queryClient.setQueryData([...ACCESS, 'settings'], saved),
  });
}
