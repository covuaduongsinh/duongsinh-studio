/**
 * Options for the queries that answer "what needs me now": the host turns `refetchOnWindowFocus` off for every query
 * (`@nocobase/app-client` `APP_QUERY_DEFAULTS`), so a phone app coming back from the lock screen kept showing numbers up
 * to a polling period old. These queries ask again when the window regains focus or the network returns. `staleTime`
 * stops a quick tab flick from firing a request for every mounted query each time.
 */
export const LIVE_QUERY = {
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
  staleTime: 5_000,
} as const;
