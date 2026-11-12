import { useChatPanel } from '@nocobase/app-plugin-agents/client/chat';
import { lazy, Suspense, useEffect, useState, type ReactElement } from 'react';

/** Loads the chat panel's code (the conversation, composer, markdown and run transcript: the bulk of the first bundle). */
const loadChatPanel = () =>
  import('#extensions/nocobase-agent-chat/chat-panel');

const ChatPanel = lazy(() =>
  loadChatPanel().then((module) => ({ default: module.ChatPanel })),
);

/** After the first page is up and the browser is idle, so the first open of the panel does not wait for the download. */
const PRELOAD_AFTER_MS = 4_000;

/**
 * The chat panel, loaded when it is first opened and fetched in the background once the page has settled (V3.3). It was
 * imported statically by the layout, so every page on a phone downloaded the whole chat before showing anything. The
 * panel itself draws nothing until it has been opened, so nothing is drawn here before that either.
 */
export function LazyChatPanel(): ReactElement | null {
  const panel = useChatPanel();
  const [wanted, setWanted] = useState(panel.open);
  if (panel.open && !wanted) setWanted(true);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const idle = (
        window as { requestIdleCallback?: (run: () => void) => number }
      ).requestIdleCallback;
      if (idle) idle(() => void loadChatPanel());
      else void loadChatPanel();
    }, PRELOAD_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, []);
  return wanted ? (
    <Suspense fallback={null}>
      <ChatPanel />
    </Suspense>
  ) : null;
}
