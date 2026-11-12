// The chat panel's code is fetched when it is first opened (or in the background later), not with the first page (V3.3).
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const panel = vi.hoisted(() => ({ open: false }));
const loaded = vi.hoisted(() => ({ count: 0 }));

vi.mock('@nocobase/app-plugin-agents/client/chat', () => ({
  useChatPanel: () => panel,
}));
vi.mock('#extensions/nocobase-agent-chat/chat-panel', () => {
  loaded.count += 1;
  return { ChatPanel: () => <aside>chat panel</aside> };
});

import { LazyChatPanel } from '../../client/layouts/components/lazy-chat-panel.js';

beforeEach(() => {
  panel.open = false;
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('lazy chat panel', () => {
  it('draws nothing and loads nothing while the panel has not been opened', () => {
    render(<LazyChatPanel />);
    expect(screen.queryByText('chat panel')).toBeNull();
    expect(loaded.count).toBe(0);
  });

  it('fetches the code in the background after the page has settled, without drawing it', async () => {
    render(<LazyChatPanel />);
    expect(loaded.count).toBe(0);
    await vi.advanceTimersByTimeAsync(5_000);
    await waitFor(() => expect(loaded.count).toBe(1));
    expect(screen.queryByText('chat panel')).toBeNull();
  });

  it('draws the panel once it is opened, and keeps it when it closes', async () => {
    const view = render(<LazyChatPanel />);
    panel.open = true;
    view.rerender(<LazyChatPanel />);
    expect(await screen.findByText('chat panel')).toBeInTheDocument();
    panel.open = false;
    view.rerender(<LazyChatPanel />);
    expect(screen.getByText('chat panel')).toBeInTheDocument();
  });
});
