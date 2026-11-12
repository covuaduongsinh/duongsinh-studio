/**
 * Studio's queries ask again when the server says something changed (V3.1), instead of only on a timer. The projects
 * plugin announces `pm:changes` (once for the events of a moment, naming the issues that changed) and the agents plugin
 * `agents:runs:<runId>`; an announcement is only a signal to read again through the API, which checks who may see what.
 * Polling stays as the fallback (60 s): announcements reach only the browsers connected to the instance that made the
 * change, are not replayed after a reconnect, and the hook asks again on subscription readiness and on focus.
 */
import {
  refreshRealtimeQueries,
  useRealtimeRefresh,
} from '@nocobase/app-client';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useQueryClient } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import {
  PM_CHANGES_TOPIC,
  REALTIME_QUERY_KEYS,
  useRealtimeAvailable,
} from '#hooks/use-realtime';

function PmChanges(): null {
  const queryClient = useQueryClient();
  useRealtimeRefresh(
    PM_CHANGES_TOPIC,
    async (signal) => {
      await Promise.all(
        REALTIME_QUERY_KEYS.map((queryKey) =>
          refreshRealtimeQueries(queryClient, { queryKey }, signal),
        ),
      );
    },
    // Bursts of events (an agent writes several records in a moment) become one read.
    { delayMs: 300 },
  );
  return null;
}

function SignedIn(): ReactElement | null {
  const { session, isPending } = useAuthentication();
  const userId = isPending ? null : (session?.user.id ?? null);
  // Keyed by the person, so a sign-in as someone else opens a new subscription for them.
  return userId ? <PmChanges key={userId} /> : null;
}

/**
 * Renders nothing: keeps the signed-in person subscribed to `pm:changes` and refreshes Studio's queries on it. Without the
 * realtime client (some shells and their tests) it does nothing, and does not ask who is signed in.
 */
export function StudioRealtime(): ReactElement | null {
  return useRealtimeAvailable() ? <SignedIn /> : null;
}
