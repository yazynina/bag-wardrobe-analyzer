// ===========================================================================
// Maison - the entry point.
//
// The app is wrapped in AuthGate, so nothing inside it renders until
// somebody is signed in. That is what stops a stranger loading the page
// and poking at the database or the Edge Functions.
// ===========================================================================

import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import AuthGate from './components/AuthGate';

const root = ReactDOM.createRoot(document.getElementById('root'));

root.render(
  <React.StrictMode>
    <AuthGate>
      <App />
    </AuthGate>
  </React.StrictMode>
);
