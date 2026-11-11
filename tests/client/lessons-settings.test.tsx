// Tests for LessonsSettingsPage (`client/pages/settings/lessons.tsx`).
import {
  answerApi,
  renderWithApp,
  type ApiCall,
} from '@nocobase/app-testing/client';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enUS from '../../client/locales/en-US.js';
import LessonsSettingsPage from '../../client/pages/settings/lessons.js';
import type { Lesson } from '../../client/hooks/use-lessons.js';
import packageMetadata from '../../package.json' with { type: 'json' };

const can = vi.hoisted(() => ({ value: true }));
vi.mock('@nocobase/app-plugin-authorization/client', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  useCan: () => ({ can: can.value, loading: false }),
}));

const mockLessons: Lesson[] = [
  {
    id: 'lesson-1',
    projectId: 'p1',
    issueId: 'i1',
    reviewId: 'r1',
    mistake: 'Hardcoded credentials in config file',
    rule: 'Never commit secrets, always use environment variables',
    tag: 'security',
    target: 'sensitivePath',
    targetRef: '.env.local',
    status: 'proposed',
    proposedByType: 'agent',
    proposedById: 'agent-1',
    decidedBy: null,
    appliedRef: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'lesson-2',
    projectId: 'p1',
    issueId: 'i2',
    reviewId: null,
    mistake: 'Migration lacked down method',
    rule: 'Always implement down reverse in migrations',
    tag: 'migration',
    target: 'skill',
    targetRef: 'ds-development',
    status: 'applied',
    proposedByType: 'user',
    proposedById: 'user-1',
    decidedBy: 'admin',
    appliedRef: 'skill:ds-development:s1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

let calls: ApiCall[] = [];

async function render(element: React.ReactElement) {
  return await renderWithApp(element, {
    namespace: packageMetadata.name,
    namespaces: { [packageMetadata.name]: enUS },
    fetch: answerApi((call: ApiCall) => {
      calls.push(call);
      const path = String(call.path);
      if (path.endsWith('lessons')) {
        return { data: mockLessons };
      }
      if (path.includes('lessons/lesson-1/decide')) {
        return { data: { ...mockLessons[0], status: 'applied' } };
      }
      return { data: null };
    }),
  });
}

beforeEach(() => {
  calls = [];
  can.value = true;
});

describe('Settings → Lessons Learned Page', () => {
  it('renders lessons table, filters, and permits managers to accept and apply lessons', async () => {
    const user = userEvent.setup();
    await render(<LessonsSettingsPage />);

    // 1. Title and description
    expect(await screen.findByText('Lessons Learned')).toBeTruthy();

    // 2. Renders lessons rows
    expect(await screen.findByText('security')).toBeTruthy();
    expect(
      screen.getByText(
        'Never commit secrets, always use environment variables',
      ),
    ).toBeTruthy();

    expect(screen.getByText('migration')).toBeTruthy();
    expect(
      screen.getByText('Always implement down reverse in migrations'),
    ).toBeTruthy();

    // 3. Status badges
    expect(screen.getByText('Proposed')).toBeTruthy();
    expect(screen.getByText('Applied')).toBeTruthy();

    // 4. Accept lesson button
    const acceptBtn = screen.getByTitle('Accept & Apply');
    expect(acceptBtn).toBeTruthy();
    await user.click(acceptBtn);

    await waitFor(() => {
      expect(
        calls.some(
          (call) =>
            call.method === 'POST' &&
            String(call.path).includes('lessons/lesson-1/decide'),
        ),
      ).toBe(true);
    });
  });
});
