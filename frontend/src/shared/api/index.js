/** One import path for the API layer: `import { api, useApi } from '@shared/api'`. */
export { api, request, API_URL, ApiError, getToken, setToken, isOffline, onOfflineChange } from './client.js';
export { useApi, useOffline } from './hooks.js';
