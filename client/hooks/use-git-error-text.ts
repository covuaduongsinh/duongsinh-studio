import { useTranslation } from '@nocobase/i18n/client';

import { errorReason } from './use-git.js';

/** The git API's refusals the application words itself; any other reads as a failed request. */
const KNOWN_REASONS = new Set([
  'GIT_CONNECTION_NOT_FOUND',
  'GIT_CONNECTION_NO_TOKEN',
  'GIT_CONNECTION_IN_USE',
  'GIT_TOKEN_REJECTED',
  'GIT_REPOSITORY_UNREACHABLE',
  'GIT_REPOSITORY_READ_ONLY',
  'GIT_REPOSITORY_LINKED',
  'GIT_REPOSITORY_ATTACHED',
  'GIT_REPOSITORY_NOT_FOUND',
  'GIT_HOST_UNAVAILABLE',
  'SECRETS_NOT_CONFIGURED',
  'PULL_REQUEST_NOT_FOUND',
  'MERGE_REFUSED_BY_HOST',
  'ACCESS_DENIED',
  'GIT_PUBLIC_URL_MISSING',
  'GIT_APP_MANIFEST_EXPIRED',
  'GIT_APP_NOT_FOUND',
  'GIT_APP_NOT_INSTALLED',
  'GIT_APP_INSTALLATION_AMBIGUOUS',
]);

/** A git API failure in the reader's language, by the error's `reason`. */
export function useGitErrorText(): (error: unknown) => string {
  const { t } = useTranslation();
  return (error) => {
    const reason = errorReason(error);
    return reason && KNOWN_REASONS.has(reason)
      ? t(`git.errors.${reason}`)
      : t('git.errors.generic');
  };
}
