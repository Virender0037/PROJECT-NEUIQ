import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AppProvider } from '@shared/context/AppContext.jsx';

/**
 * Entry point.
 *
 * <BrowserRouter> is OUTSIDE <AppProvider> because the provider derives `view` from the URL
 * with useLocation() — inside-out and it would have no router to read.
 */
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppProvider>
        <App />
      </AppProvider>
    </BrowserRouter>
  </React.StrictMode>
);
