/**
 * What remains of NeuIQ's mock content: nothing that looks like data.
 *
 * This file used to hold every invented thing the UI showed — chat and message counts, a weekly
 * usage chart, projects, files, tasks, chat history, generic prompts, a canned conversation
 * (removed in Phase 3) and a canned assistant reply used when the API was unreachable (removed in
 * Phase 4, along with every other offline fallback). Nothing that looks like business data may be
 * added back here.
 *
 *   PREFERENCES  Settings toggle labels — UI configuration, not data.
 */

export const PREFERENCES = [
  { key: 'suggestions', title: 'Show suggested prompts', sub: 'Display prompt cards on the new chat screen' },
  { key: 'streaming', title: 'Stream responses', sub: 'Reveal replies word by word as they generate' },
  { key: 'sounds', title: 'Interface sounds', sub: 'Play subtle sounds for key actions' },
  { key: 'entersends', title: 'Press Enter to send', sub: 'Use Shift+Enter for a new line' },
];
