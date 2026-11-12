import {
  ClientApplicationContext,
  realtimeClientToken,
} from '@nocobase/app-client';
import { useContext } from 'react';

/** The projects plugin's `PM_REALTIME_TOPIC` (`@nocobase/app-plugin-projects/shared/realtime`). */
export const PM_CHANGES_TOPIC = 'pm:changes';

/**
 * The roots of the query keys Studio's own hooks use for what an issue change can touch: Today, the issue lists, the menu
 * badge, "my work", follow-ups, an issue's panels and runs (`['issues', id, ...]`) and the agent board.
 */
export const REALTIME_QUERY_KEYS: readonly (readonly string[])[] = [
  ['today'],
  ['task-groups'],
  ['navigation-badges'],
  ['my-work'],
  ['follow-ups'],
  ['issues'],
  ['agent-board'],
];

/** Whether the application has the realtime client; some shells and their tests mount pages without it. */
export function useRealtimeAvailable(): boolean {
  const services = useContext(ClientApplicationContext)?.services;
  return services?.has(realtimeClientToken) === true;
}
