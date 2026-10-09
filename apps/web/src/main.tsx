import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ThemeGateway from './theme-gateway/ThemeGateway';
import './styles.css';

// Only the preview path loads the new visual shell. All original routes keep App.
const isThemePreview = window.location.pathname.replace(/\/$/, '') === '/theme-preview';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isThemePreview ? <ThemeGateway /> : <App />}
  </React.StrictMode>
);