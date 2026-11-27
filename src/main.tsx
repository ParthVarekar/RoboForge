import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RootRouter } from './RootRouter';
import './styles.css';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root mount element #root not found.');
}

createRoot(rootEl).render(
  <StrictMode>
    <RootRouter />
  </StrictMode>,
);
