import type { ReactElement } from 'react';
import { useParams } from 'react-router';

import { ChatConversationPage } from '#extensions/nocobase-agent-chat/conversation-page';

/**
 * One conversation with an agent as a page of its own (`/chat/:conversationId`), where the chat panel's "Open full page"
 * goes. A new conversation starts from the panel, so "New" leads back to the home page, which opens it.
 */
export default function ChatConversationRoute(): ReactElement | null {
  const { conversationId } = useParams();
  if (!conversationId) return null;
  return (
    <ChatConversationPage conversationId={conversationId} newConversationPath='/' />
  );
}
