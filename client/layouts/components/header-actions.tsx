import type { ReactElement } from 'react';
import { TooltipProvider } from '#components/ui/tooltip';
import { ChatHeaderButton } from '#extensions/nocobase-agent-chat/launchers';

import { HeaderQuickLinks } from './header-quick-links.js';
import { UserMenu } from './user-menu.js';

/** The header's right-hand actions, shared by every authenticated page. */
export function HeaderActions(): ReactElement {
  return (
    <TooltipProvider>
      <div className='flex shrink-0 items-center gap-2'>
        {/* Opens the agents' chat (⌘J / Ctrl+J); nothing while signed out. */}
        <ChatHeaderButton />
        <HeaderQuickLinks />
        <UserMenu />
      </div>
    </TooltipProvider>
  );
}
