import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ViewProvider } from './context/ViewContext';
import { ConfigProvider } from './context/ConfigContext';
import { ProcessesProvider } from './context/ProcessesContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ViewProvider>
      <ConfigProvider>
        <ProcessesProvider>
          <App />
        </ProcessesProvider>
      </ConfigProvider>
    </ViewProvider>
  </React.StrictMode>,
);
