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
import { IssueCriteriaSection } from '../../client/components/criteria/criteria-editor.js';

let calls: ApiCall[] = [];
let initialCriteria: unknown[] = [];

function renderCriteriaSection(canEdit = true) {
  return renderWithApp(
    <IssueCriteriaSection issueId='issue-1' canEdit={canEdit} />,
    {
      namespace: packageMetadata.name,
      namespaces: { [packageMetadata.name]: viVN },
      fetch: answerApi((call: ApiCall) => {
        calls.push(call);
        if (call.method === 'PUT') {
          return { data: call.body };
        }
        return { data: initialCriteria };
      }),
    },
  );
}

describe('CriteriaEditor and IssueCriteriaSection', () => {
  beforeEach(() => {
    calls = [];
    initialCriteria = [];
  });

  it('leaves the section out when there are no criteria and the viewer cannot edit', async () => {
    const { container } = await renderCriteriaSection(false);
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    expect(screen.queryByText('Chưa có tiêu chí nghiệm thu.')).toBeNull();
    expect(screen.queryByTestId('criteria-editor')).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it('shows one line instead of a block when there are none and the viewer can edit, until they add', async () => {
    await renderCriteriaSection(true);
    const open = await screen.findByTestId('criteria-open-btn');
    expect(screen.getByText('Chưa có tiêu chí nghiệm thu.')).toBeTruthy();
    // The editor is not drawn yet.
    expect(screen.queryByTestId('criteria-text-input')).toBeNull();
    await userEvent.click(open);
    expect(await screen.findByTestId('criteria-text-input')).toBeTruthy();
  });

  it('renders existing criteria with correct badges and values', async () => {
    initialCriteria = [
      {
        id: 'c1',
        text: 'Unit test chạy qua 100%',
        checkKind: 'test',
        checkValue: 'tests/server/api.test.ts',
        source: 'human',
      },
      {
        id: 'c2',
        text: 'CI check xanh',
        checkKind: 'ci',
        source: 'agent',
      },
    ];

    renderCriteriaSection(false);
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));

    expect(screen.getByText('Unit test chạy qua 100%')).toBeTruthy();
    expect(screen.getByText('Kiểm thử')).toBeTruthy();
    expect(screen.getByText('tests/server/api.test.ts')).toBeTruthy();

    expect(screen.getByText('CI check xanh')).toBeTruthy();
    expect(screen.getByText('Kiểm tra CI')).toBeTruthy();
    expect(screen.getByText('Agent đề xuất')).toBeTruthy();
  });

  it('allows adding and saving new criteria when canEdit is true', async () => {
    initialCriteria = [];
    renderCriteriaSection(true);
    await userEvent.click(await screen.findByTestId('criteria-open-btn'));

    const input = screen.getByTestId('criteria-text-input');
    await userEvent.type(input, 'Test chạy không lỗi');

    const valueInput = screen.getByTestId('criteria-value-input');
    await userEvent.type(valueInput, 'pnpm test');

    const addBtn = screen.getByTestId('criteria-add-btn');
    await userEvent.click(addBtn);

    expect(screen.getByText('Test chạy không lỗi')).toBeTruthy();

    const saveBtn = screen.getByTestId('criteria-save-btn');
    await userEvent.click(saveBtn);

    await waitFor(() => {
      expect(calls.some((c) => c.method === 'PUT')).toBe(true);
    });
  });
});
