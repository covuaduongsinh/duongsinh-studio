// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { createNb3PreviewHooks } from '../../server/releases/nb3-preview.js';

function hooks(
  labels: Record<string, string> | null,
  appId: string | null = 'nocolms-preview',
) {
  const stop = vi.fn(() => Promise.resolve());
  const subject = createNb3PreviewHooks({
    previewAppId: () => Promise.resolve(appId),
    currentLabels: () => Promise.resolve(labels),
    stop,
  });
  return { subject, stop };
}
const pull = (action: string, number = 7, label?: string) => ({
  action,
  number,
  pull_request: { number },
  ...(label ? { label: { name: label } } : {}),
});

it('stops the preview when its pull request is closed', async () => {
  const { subject, stop } = hooks({ pr: '7', sha: 'abc' });
  expect(await subject.onWebhook('r1', 'pull_request', pull('closed'))).toBe(
    'stopped',
  );
  expect(stop).toHaveBeenCalledWith('nocolms-preview');
});

it('stops it when the preview label is removed, not another label', async () => {
  const { subject, stop } = hooks({ pr: '7' });
  expect(
    await subject.onWebhook('r1', 'pull_request', pull('unlabeled', 7, 'bug')),
  ).toBe('ignored');
  expect(
    await subject.onWebhook(
      'r1',
      'pull_request',
      pull('unlabeled', 7, 'preview'),
    ),
  ).toBe('stopped');
  expect(stop).toHaveBeenCalledTimes(1);
});

it('leaves a preview that belongs to another pull request', async () => {
  const { subject, stop } = hooks({ pr: '9' });
  expect(await subject.onWebhook('r1', 'pull_request', pull('closed', 7))).toBe(
    'notThisPull',
  );
  expect(stop).not.toHaveBeenCalled();
});

it('ignores other events and actions, and a repository without a preview App', async () => {
  const { subject, stop } = hooks({ pr: '7' });
  expect(await subject.onWebhook('r1', 'push', {})).toBe('ignored');
  expect(await subject.onWebhook('r1', 'pull_request', pull('opened'))).toBe(
    'ignored',
  );
  expect(
    await hooks(null).subject.onWebhook('r1', 'pull_request', pull('closed')),
  ).toBe('notThisPull');
  expect(
    await hooks({ pr: '7' }, null).subject.onWebhook(
      'r1',
      'pull_request',
      pull('closed'),
    ),
  ).toBe('noPreviewApp');
  expect(stop).not.toHaveBeenCalled();
});
