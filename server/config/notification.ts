import { defineMailChannelsConfig } from '@nocobase/app-plugin-notification-providers/config';
import { type AppConfigFactory } from '@nocobase/app-server/config';
import type { NotificationConfig } from '@nocobase/app-plugin-notification/server';

// Dương Sinh: Studio tells people about issues only through the in-app inbox until SMTP is set up (stage S6), and the
// projects plugin sends its notices to the `inbox` channel, so that channel is a default rather than something each
// config.yml must remember.
const notification: AppConfigFactory<NotificationConfig> =
  defineMailChannelsConfig({
    defaults: {
      channels: { inbox: { type: 'in-app', provider: 'in-app' } },
    },
  });

export default notification;
