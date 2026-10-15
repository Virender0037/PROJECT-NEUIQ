/**
 * Local entry point.
 *
 * On Catalyst this file is replaced by the function handler, which hands the same app to the
 * Advanced I/O runtime. Everything that decides anything lives under functions/neuiq_api/src,
 * so that swap is a few lines and touches no logic.
 */
import {
  assertBootable, describeDataSource, publicDataSource,
} from './functions/neuiq_api/src/integrations/zoho/people/dataSource.js';
import { describeAuthMode } from './functions/neuiq_api/src/core/auth/mode.js';
import { resolveEnvironmentProfile, describeEnvironment } from './functions/neuiq_api/src/core/platform/environment.js';
import { ENVIRONMENT_CHECKS } from './functions/neuiq_api/src/integrations/environmentChecks.js';

const PORT = Number(process.env.PORT) || 4200;

/**
 * The whole deployment profile is decided here, once, before anything listens — and before the
 * app is even loaded.
 *
 * In production with the seed selected, `assertBootable()` throws and the process exits non-zero,
 * because a server that starts and then serves generated demo records as real HR figures is worse
 * than one that refuses to start. The environment profile then applies every other startup rule:
 * sign-in mode, NEUIQ_ENV, the Zoho data centre and the signing secret. createApp() re-resolves
 * the same profile, so this is the clean exit, not the only guard.
 *
 * The app is imported only AFTER the profile is accepted. Importing it builds the integration
 * manifests, and a live manifest reads credentials; a configuration this process refuses must
 * fail with a one-line reason here, not with a stack trace from inside an import.
 */
let dataSource;
let profile;
let app;
try {
  dataSource = assertBootable();
  profile = resolveEnvironmentProfile(process.env, {
    dataSource: publicDataSource(dataSource),
    integrationChecks: ENVIRONMENT_CHECKS,
  });
  const { createApp } = await import('./functions/neuiq_api/src/app.js');
  app = createApp();
} catch (err) {
  console.error(`NeuIQ API refused to start: ${err.message}`);
  process.exit(1);
}

app.listen(PORT, () => {
  // 4200, not 4000 or 4100 - the two sibling projects in this workspace own those, and they
  // get run side by side. Sharing a port means whichever starts second fails, or worse,
  // silently proxies to the other app's API.
  console.log(`NeuIQ API on http://localhost:${PORT}/api/v1`);
  console.log(process.env.GEMINI_API_KEY ? 'Gemini: configured' : 'Gemini: not configured — routing via keywords');
  // Whoever reads these lines is deciding whether to trust the numbers on their screen.
  console.log(`Environment: ${describeEnvironment(profile)}`);
  console.log(`Data: ${describeDataSource(dataSource)}`);
  if (profile.integrations.zohoDc) console.log(`Zoho data centre: ${profile.integrations.zohoDc}`);
  console.log(`Auth: ${describeAuthMode(profile.auth)}`);
});
