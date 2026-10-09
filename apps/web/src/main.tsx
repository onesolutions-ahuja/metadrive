import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import MetaDriveReactGateway from './metadrive-react/Gateway';
import './styles.css';

const showNewGateway = /^\/theme(?:\/|$)/.test(window.location.pathname);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {showNewGateway ? <MetaDriveReactGateway /> : <App />}
  </React.StrictMode>
);
