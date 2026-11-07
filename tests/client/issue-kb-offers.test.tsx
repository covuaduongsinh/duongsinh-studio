// The knowledge offers on an issue, with `/api/kb/offers` answered by the fixture below.
import {
  answerApi,
  renderWithApp,
  type ApiCall,
} from '@nocobase/app-testing/client';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import packageMetadata from '../../package.json' with { type: 'json' };
import enUS from '../../client/locales/en-US.js';
import { IssueKbOffers } from '../../client/pages/issues/detail/issue-kb-offers.js';

const offer = (over: Record<string, unknown>) => ({
  id: 'o1',
  issueId: 'i1',
  attachmentId: 'a1',
  reason: 'Tài liệu dùng lại được',
  status: 'pending',
  targetScope: null,
  targetScopeId: null,
  decidedById: null,
  docId: null,
  canDecide: true,
  ...over,
});

let calls: ApiCall[] = [];
let listed: unknown[] = [];

function render() {
  return renderWithApp(<IssueKbOffers issueId='i1' />, {
    namespace: packageMetadata.name,
    namespaces: { [packageMetadata.name]: enUS },
    fetch: answerApi((call: ApiCall) => {
      calls.push(call);
      return call.method === 'POST' ? { data: offer({}) } : { data: listed };
    }),
  });
}

describe('issue knowledge offers', () => {
  beforeEach(() => {
    calls = [];
    listed = [];
  });

  it('shows nothing without offers', async () => {
    render();
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('lets who may decide keep or decline a file', async () => {
    listed = [offer({})];
    render();
    const section = await screen.findByRole('region', {
      name: 'Keep as knowledge?',
    });
    expect(within(section).getByText('Tài liệu dùng lại được')).toBeTruthy();
    await userEvent.click(
      within(section).getByRole('button', { name: 'Keep' }),
    );
    await waitFor(() =>
      expect(
        calls.some((call) => String(call.path).endsWith('o1/accept')),
      ).toBe(true),
    );
  });

  it('only shows the state to everyone else', async () => {
    listed = [
      offer({ canDecide: false }),
      offer({ id: 'o2', status: 'saved' }),
    ];
    render();
    const section = await screen.findByRole('region', {
      name: 'Keep as knowledge?',
    });
    expect(within(section).queryByRole('button')).toBeNull();
    expect(within(section).getByText('Waiting for a decision')).toBeTruthy();
    expect(within(section).getByText('Saved')).toBeTruthy();
  });
});
