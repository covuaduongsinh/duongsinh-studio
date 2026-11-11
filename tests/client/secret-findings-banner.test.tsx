import {
  answerApi,
  renderWithApp,
  type ApiCall,
} from '@nocobase/app-testing/client';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import packageMetadata from '../../package.json' with { type: 'json' };
import viVN from '../../client/locales/vi-VN.js';
import { SecretFindingsBanner } from '../../client/components/secret-findings-banner.js';

let calls: ApiCall[] = [];
let initialFindings: unknown[] = [];

function renderBanner(issueId = 'issue-test-1') {
  return renderWithApp(<SecretFindingsBanner issueId={issueId} />, {
    namespace: packageMetadata.name,
    namespaces: { [packageMetadata.name]: viVN },
    fetch: answerApi((call: ApiCall) => {
      calls.push(call);
      if (call.method === 'POST') {
        return { data: { id: 'sf-1', status: 'resolved' } };
      }
      return { data: initialFindings };
    }),
  });
}

describe('SecretFindingsBanner', () => {
  beforeEach(() => {
    calls = [];
    initialFindings = [];
  });

  it('renders nothing when there are no secret findings', async () => {
    initialFindings = [];
    renderBanner();
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    expect(screen.queryByTestId('secret-findings-banner')).toBeNull();
  });

  it('renders nothing when all findings are resolved or ignored', async () => {
    initialFindings = [
      {
        id: 'sf-1',
        issueId: 'issue-test-1',
        patternKey: 'openai_api_key',
        fingerprint: 'abcd1234',
        status: 'resolved',
      },
      {
        id: 'sf-2',
        issueId: 'issue-test-1',
        patternKey: 'github_personal_token',
        fingerprint: 'efgh5678',
        status: 'ignored',
      },
    ];
    renderBanner();
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    expect(screen.queryByTestId('secret-findings-banner')).toBeNull();
  });

  it('renders alert banner with active findings and buttons', async () => {
    initialFindings = [
      {
        id: 'sf-1',
        issueId: 'issue-test-1',
        patternKey: 'openai_api_key',
        fingerprint: 'abcd1234',
        status: 'active',
      },
    ];
    renderBanner();
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));

    expect(screen.getByTestId('secret-findings-banner')).toBeTruthy();
    expect(screen.getByText('openai_api_key')).toBeTruthy();
    expect(screen.getByText('Đã xoay khoá / Đã xử lý')).toBeTruthy();
    expect(screen.getByText('Báo nhầm / Bỏ qua')).toBeTruthy();
  });

  it('allows clicking resolve to update status', async () => {
    const user = userEvent.setup();
    initialFindings = [
      {
        id: 'sf-1',
        issueId: 'issue-test-1',
        patternKey: 'openai_api_key',
        fingerprint: 'abcd1234',
        status: 'active',
      },
    ];
    renderBanner();
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));

    const resolveBtn = screen.getByText('Đã xoay khoá / Đã xử lý');
    await user.click(resolveBtn);

    await waitFor(() => {
      expect(
        calls.some(
          (c) =>
            c.method === 'POST' &&
            String(c.path).includes('secret-findings/sf-1/status'),
        ),
      ).toBe(true);
    });
  });

  it('allows clicking ignore to update status', async () => {
    const user = userEvent.setup();
    initialFindings = [
      {
        id: 'sf-2',
        issueId: 'issue-test-1',
        patternKey: 'github_personal_token',
        fingerprint: 'efgh5678',
        status: 'active',
      },
    ];
    renderBanner();
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));

    const ignoreBtn = screen.getByText('Báo nhầm / Bỏ qua');
    await user.click(ignoreBtn);

    await waitFor(() => {
      expect(
        calls.some(
          (c) =>
            c.method === 'POST' &&
            String(c.path).includes('secret-findings/sf-2/status'),
        ),
      ).toBe(true);
    });
  });
});
