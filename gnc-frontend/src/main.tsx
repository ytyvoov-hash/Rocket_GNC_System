import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './i18n/index.ts';
import App from './App.tsx';
import { Provider } from 'react-redux';
import { store } from './store/store.ts';
import { keycloak } from './services/keycloak.ts';
import { login } from './store/authSlice.ts';
import { auditWrite } from './utils/audit.ts';

async function mount() {
  if (keycloak) {
    try {
      const authenticated = await keycloak.init({
        onLoad: 'check-sso',
        checkLoginIframe: false,
      });
      if (authenticated && keycloak.tokenParsed) {
        const roles = keycloak.realmAccess?.roles ?? [];
        const role = (['admin', 'operator', 'engineer', 'viewer'] as const)
          .find(r => roles.includes(r)) ?? 'viewer';
        const operatorId = (keycloak.tokenParsed as Record<string, string>)['preferred_username'] ?? 'sso-user';
        store.dispatch(login({ operatorId, role }));
        auditWrite(store.dispatch, operatorId, 'SSO_LOGIN');
      }
    } catch {
      console.warn('[Keycloak] SSO check failed — falling back to form login');
    }
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Provider store={store}>
        <App />
      </Provider>
    </StrictMode>,
  );
}

mount();
