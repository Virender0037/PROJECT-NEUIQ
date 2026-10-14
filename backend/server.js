/**
 * Local entry point.
 *
 * On Catalyst this file is replaced by the function handler, which hands the same app to the
 * Advanced I/O runtime. Everything that decides anything lives under functions/neuiq_api/src,
 * so that swap is a few lines and touches no logic.
 */
import { createApp } from './functions/neuiq_api/src/app.js';
import {
  assertBootable, describeDataSource, publicDataSource,
} from './functions/neuiq_api/src/integrations/zoho/people/dataSource.js';
import { resolveAuthMode, describeAuthMode } from './functions/neuiq_api/src/core/auth/mode.js';

const PORT = Number(process.env.PORT) || 4200;

/**
 * The data source is decided here, once, before anything listens.
 *
 * In production with the seed selected this throws and the process exits non-zero, because a
 * server that starts and then serves generated demo records as real HR figures is worse than one
 * that refuses to start. Nothing downstream can change the decision at request time.
 */
let dataSource;
let authMode;
let app;
try {
  dataSource = assertBootable();
  // How callers sign in is decided here too, against the data source just resolved: demo login
  // is refused over anything but seed data, and in production. createApp() re-checks the same
  // rules, so this is the clean exit, not the only guard.
  authMode = resolveAuthMode(process.env, { dataSource: publicDataSource(dataSource) });
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
  // Whoever reads this line is deciding whether to trust the numbers on their screen.
  console.log(`Data: ${describeDataSource(dataSource)}`);
  console.log(`Auth: ${describeAuthMode(authMode)}`);
});
