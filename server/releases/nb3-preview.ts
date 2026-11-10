/**
 * Pull request previews of NocoBase 3 Apps (M4.3).
 *
 * One preview App per repository (environment `preview`, one fixed host, so no wildcard DNS and one PR at a time). The
 * repository's CI builds the archive for a pull request labelled `preview` and uploads it to that App with the labels
 * `pr=<number>` and `sha=<commit>` and `--deploy`; Studio does not build. What Studio adds is the end of the life: when
 * the pull request is closed or loses the label, the preview App is stopped, but only if the release it runs belongs to
 * that pull request (a newer PR's preview is never stopped by an older PR closing).
 */

/** The pull request label that asks for a preview. */
export const NB3_PREVIEW_LABEL = 'preview';
/** The release label that names the pull request a preview was built for. */
export const PR_LABEL_KEY = 'pr';

export type PreviewHookResult =
  'ignored' | 'noPreviewApp' | 'notThisPull' | 'stopped';

export interface PreviewHookDeps {
  /** The App id registered for the repository's `preview` environment; null when there is none. */
  readonly previewAppId: (repositoryId: string) => Promise<string | null>;
  /** The labels of the release the App currently runs; null when it runs none. */
  readonly currentLabels: (
    appId: string,
  ) => Promise<Readonly<Record<string, string>> | null>;
  readonly stop: (appId: string) => Promise<void>;
}

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};

/** Stops the preview App when the pull request it runs is closed or loses the `preview` label. */
export function createNb3PreviewHooks(deps: PreviewHookDeps) {
  return {
    async onWebhook(
      repositoryId: string,
      event: string,
      payload: Record<string, unknown>,
    ): Promise<PreviewHookResult> {
      if (event !== 'pull_request') return 'ignored';
      const action = payload.action;
      const label = record(payload.label).name;
      const closing =
        action === 'closed' ||
        (action === 'unlabeled' && label === NB3_PREVIEW_LABEL);
      const number = Number(
        record(payload.pull_request).number ?? payload.number,
      );
      if (!closing || !Number.isInteger(number) || number <= 0)
        return 'ignored';
      const appId = await deps.previewAppId(repositoryId);
      if (!appId) return 'noPreviewApp';
      const labels = await deps.currentLabels(appId);
      if (labels?.[PR_LABEL_KEY] !== String(number)) return 'notThisPull';
      await deps.stop(appId);
      return 'stopped';
    },
  };
}
