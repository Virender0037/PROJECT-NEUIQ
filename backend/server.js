/**
 * Local entry point.
 *
 * On Catalyst this file is replaced by the function handler, which hands the same app to the
 * Advanced I/O runtime. Everything that decides anything lives under functions/neuiq_api/src,
 * so that swap is a few lines and touches no logic.
 */
import { createApp } from './functions/neuiq_api/src/app.js';

const PORT = Number(process.env.PORT) || 4200;

createApp().listen(PORT, () => {
  // 4200, not 4000 or 4100 - the two sibling projects in this workspace own those, and they
  // get run side by side. Sharing a port means whichever starts second fails, or worse,
  // silently proxies to the other app's API.
  console.log(`NeuIQ API on http://localhost:${PORT}/api/v1`);
  console.log(process.env.GEMINI_API_KEY ? 'Gemini: configured' : 'Gemini: not configured — routing via keywords');
});
