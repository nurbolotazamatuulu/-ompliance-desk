import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import { routes } from './routes';
import './styles/tokens.css';
import './styles/index.css';

// Восстанавливаем тему из localStorage до маунта, чтобы не моргало
const savedTheme = localStorage.getItem('cd:theme') || 'dark';
document.documentElement.dataset.theme = savedTheme;

const router = createBrowserRouter(routes);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
