import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  apiErrorResponses,
  cliRoute,
  defineApiRoutes,
  describeRoute,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { gitServiceToken } from '../providers/git.js';

/** GitHub sends at most 25 MB; the events Studio subscribes to are far smaller. */
const MAX_BODY_BYTES = 5 * 1024 * 1024;

/**
 * GitHub's webhook for an App connection (`/api/webhooks/github/connections/{connectionId}`). No session: the only
 * credential is `X-Hub-Signature-256`, the HMAC of the raw body with the App's webhook secret, checked before anything
 * is read. A wrong signature, an unknown connection and a token connection all answer the same 401; nothing else of
 * Studio is reachable here.
 */
export const webhookRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const { container } = app;

    router.post(
      '/webhooks/github/connections/:connectionId',
      describeRoute({
        tags: ['Studio'],
        summary: 'Receive a GitHub App webhook delivery',
        description:
          'Signed by GitHub with the App’s webhook secret (`X-Hub-Signature-256`). Pull requests and checks it names are read again at once; a delivery id seen before is not handled twice.',
        operationId: 'studioGitWebhook',
        security: [],
        ...cliRoute(false),
        responses: {
          '202': { description: 'Handled.' },
          '200': { description: 'A delivery handled before.' },
          ...apiErrorResponses,
        },
      }),
      bodyLimit({
        maxSize: MAX_BODY_BYTES,
        onError: () => {
          throw new ApiError({
            status: 'INVALID_ARGUMENT',
            reason: 'PAYLOAD_TOO_LARGE',
            domain: 'studio',
            message: 'The delivery is larger than Studio accepts.',
          });
        },
      }),
      async (context) => {
        const body = new Uint8Array(await context.req.arrayBuffer());
        const outcome = await container.resolve(gitServiceToken).handleWebhook({
          connectionId: context.req.param('connectionId'),
          event: context.req.header('x-github-event') ?? null,
          deliveryId: context.req.header('x-github-delivery') ?? null,
          signature: context.req.header('x-hub-signature-256') ?? null,
          body,
        });
        if (outcome.status === 401)
          throw new ApiError({
            status: 'UNAUTHENTICATED',
            reason: 'WEBHOOK_SIGNATURE_INVALID',
            domain: 'studio',
            message:
              'The delivery is not signed with this connection’s webhook secret.',
          });
        if (outcome.status === 400)
          throw new ApiError({
            status: 'INVALID_ARGUMENT',
            reason: 'WEBHOOK_DELIVERY_INVALID',
            domain: 'studio',
            message:
              'The delivery has no event, no delivery id or no JSON body.',
          });
        return context.json(
          {
            data: {
              handled: outcome.handled ?? null,
              duplicate: outcome.duplicate === true,
            },
          },
          outcome.status,
        );
      },
    );

    return router;
  });
