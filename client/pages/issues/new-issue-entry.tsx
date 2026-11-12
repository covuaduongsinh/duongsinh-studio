import type { ComponentType } from 'react';
import { Navigate, useLocation } from 'react-router';

/**
 * Parameters that say the person chose the AI draft: `?tab=` (either tab, explicit), `?draft=` and `?job=` (an intake
 * draft or a request to AI being followed). Without any of them the plugin opens the tab last used and, failing
 * that, "AI draft", which splits every bullet line of a long prompt into its own issue (DS-25…DS-56).
 */
const CHOSEN_PARAMS = ['tab', 'draft', 'job'] as const;

/**
 * Wraps the projects plugin's "New issue" dialog so it opens on "Manual" (one issue) unless the person chose otherwise.
 *
 * The plugin's own switch, `IssueCreationModeContext='manual'`, removes the tab bar altogether, which loses the AI
 * draft path; this redirect keeps both tabs and only changes the default. The browser-remembered tab
 * (`pm:new-issue-tab`) is ignored on purpose: a link without parameters always opens "Manual".
 * See `docs/plans/2026-11-12-studio-thuan-tien-V.md` (V0.1) and `docs/chenh-lech-upstream.md`.
 */
export function withManualDefault(Page: ComponentType): ComponentType {
  function NewIssueEntry() {
    const { search } = useLocation();
    const params = new URLSearchParams(search);
    if (!CHOSEN_PARAMS.some((name) => params.has(name))) {
      params.set('tab', 'manual');
      return <Navigate replace to={{ search: `?${params.toString()}` }} />;
    }
    return <Page />;
  }
  return NewIssueEntry;
}
