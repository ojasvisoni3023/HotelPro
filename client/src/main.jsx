import '@fontsource/marcellus/400.css';
import '@fontsource-variable/manrope';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'react-toastify/dist/ReactToastify.css';
import './styles/theme.css';
import './components/booking/booking.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { ToastContainer } from 'react-toastify';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { AuthProvider } from './context/AuthContext';
import { ConfigProvider } from './context/ConfigContext';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <ConfigProvider>
          <AuthProvider>
            <App />
            <ToastContainer position="bottom-right" autoClose={4000} newestOnTop theme="light" />
          </AuthProvider>
        </ConfigProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>
);
