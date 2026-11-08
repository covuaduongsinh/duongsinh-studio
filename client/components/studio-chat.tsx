import {
  agentsQueryClient,
  CHAT_PANEL_STORAGE_KEY,
  ChatExtensionsContext,
  ChatProvider,
  type ChatExtensions,
  type ChatTimelineItem,
} from '@nocobase/app-plugin-agents/client/chat';
import {
  ClientApplicationContext,
  realtimeClientToken,
} from '@nocobase/app-client';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { planKeys, usePlanApi } from '@nocobase/app-plugin-projects/client/kit';
import { useQuery } from '@tanstack/react-query';
import {
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

import { PlanCard } from '#extensions/nocobase-plan-card/plan-card';
import {
  conversationPath,
  conversationPlansQuery,
  studioNewsText,
} from '#lib/studio-chat';

/**
 * The plans an agent proposed in the conversation, as cards among its messages, where the person reviews and executes
 * them. `revision` changes with every message or run change, so a plan proposed in the last turn shows at once.
 */
function useConversationPlans(
  conversationId: string,
  revision: number,
): readonly ChatTimelineItem[] {
  const api = usePlanApi();
  const query = conversationPlansQuery(conversationId);
  const plans = useQuery({
    queryKey: [...planKeys.list(query), revision],
    queryFn: () => api.plans(query),
    enabled: conversationId !== '',
  });
  return useMemo(
    () =>
      (plans.data?.data ?? []).map((plan): ChatTimelineItem => ({
        key: `plan:${plan.id}`,
        at: plan.createdAt,
        node: <PlanCard planId={plan.id} plan={plan} linkTitle={false} />,
      })),
    [plans.data],
  );
}

const extensions: ChatExtensions = {
  useTimelineItems: useConversationPlans,
  newsText: studioNewsText,
};

/**
 * The agents' chat around the signed-in application (`ChatProvider` of the agents plugin), one per person: their
 * panel state and the agents' query cache are cleared when the person changes, so nobody sees another's conversations.
 * Signed out, or in an application without the realtime client the chat listens on, the pages render without it and
 * the chat's buttons render nothing.
 */
export function StudioChatProvider({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  // Some shells (and their tests) mount the layout without an application or its services.
  const services = useContext(ClientApplicationContext)?.services;
  const realtime = services?.has(realtimeClientToken) === true;
  return realtime ? <SignedInChat>{children}</SignedInChat> : <>{children}</>;
}

function SignedInChat({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  const { session, isPending } = useAuthentication();
  const userId = isPending ? null : (session?.user.id ?? null);
  return userId ? (
    <PersonChat key={userId} userId={userId}>
      {children}
    </PersonChat>
  ) : (
    <>{children}</>
  );
}

function PersonChat({
  userId,
  children,
}: {
  readonly userId: string;
  readonly children: ReactNode;
}): ReactElement | null {
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    const reset = (): void => {
      try {
        window.sessionStorage.removeItem(CHAT_PANEL_STORAGE_KEY);
      } catch {
        // Storage may be unavailable; the panel then simply starts closed.
      }
      agentsQueryClient().clear();
    };
    reset();
    let active = true;
    // Let the previous person's chat finish unmounting before the next one mounts.
    queueMicrotask(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
      reset();
    };
  }, []);
  return ready ? (
    <ChatExtensionsContext.Provider value={extensions}>
      <ChatProvider memoryScope={userId} conversationPath={conversationPath}>
        {children}
      </ChatProvider>
    </ChatExtensionsContext.Provider>
  ) : null;
}
