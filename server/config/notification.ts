import { defineMailChannelsConfig } from '@nocobase/app-plugin-notification-providers/config';
import {
  envBoolean,
  envString,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { NotificationConfig } from '@nocobase/app-plugin-notification/server';

// Dương Sinh: the projects plugin sends its notices to the `inbox` channel, so that channel is a default rather than
// something each config.yml must remember. Studio's own email goes through a Gmail account with an App Password and
// stays off until `STUDIO_EMAIL_ENABLED`, `STUDIO_SMTP_USER`, `STUDIO_SMTP_PASSWORD` and `STUDIO_SMTP_FROM` are set. It is
// not called `system-email`: the Users plugin takes that name, even switched off, to mean invitations can be emailed.
const notification: AppConfigFactory<NotificationConfig> =
  defineMailChannelsConfig({
    defaults: {
      channels: {
        inbox: { type: 'in-app', provider: 'in-app' },
        'studio-email': {
          type: 'smtp',
          provider: 'smtp',
          enabled: false,
          host: 'smtp.gmail.com',
          port: 465,
          secure: true,
          auth: { user: '', pass: '' },
          from: '',
        },
        webPush: { type: 'web-push', provider: 'web-push' },
      },
    },
    env: {
      STUDIO_EMAIL_ENABLED: envBoolean('channels.studio-email.enabled', {
        description: 'Send email to people who keep that choice on.',
        required: false,
      }),
      STUDIO_SMTP_USER: envString('channels.studio-email.auth.user', {
        description: 'The mail account Studio signs in with.',
        required: false,
      }),
      STUDIO_SMTP_PASSWORD: envString('channels.studio-email.auth.pass', {
        description: 'The App Password of that account.',
        secret: true,
        required: false,
      }),
      STUDIO_SMTP_FROM: envString('channels.studio-email.from', {
        description: 'The address Studio sends from.',
        required: false,
      }),
    },
  });

export default notification;
