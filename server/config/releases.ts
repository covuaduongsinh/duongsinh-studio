import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { ReleasesPluginConfig } from '@nocobase/app-plugin-releases/server';

// The releases plugin ships no config factory, so the application declares its `releases` section here. Archives go
// on the private `local` disk under their own prefix; the plugin keeps deployment logs and applied configs in dataDir.
// The in-process and Docker App Hosts stay off until S5 (release environments).
const releases: AppConfigFactory<ReleasesPluginConfig> = defineAppConfig(
  ({ paths }) => ({
    artifact: { disk: 'local', prefix: 'release-artifacts' },
    dataDir: paths.storage('releases'),
  }),
);

export default releases;
