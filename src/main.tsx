/**
 * App entry. Global CSS order: fonts → tokens → base → utilities; then component CSS Modules.
 * The store is bootstrapped (hash/localStorage → state, persistence, engine, preview
 * scheduler, window.__stacklamp debug hook) before the first render.
 */
import './ui/styles/fonts.css';
import './ui/styles/tokens.css';
import './ui/styles/base.css';
import './ui/styles/utilities.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { bootstrapLamp } from './state';

bootstrapLamp();

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing from index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
