import Keycloak from 'keycloak-js';

const keycloakUrl = import.meta.env.VITE_KEYCLOAK_URL as string | undefined;

export const keycloak = keycloakUrl
  ? new Keycloak({ url: keycloakUrl, realm: 'gnc', clientId: 'gnc-frontend' })
  : null;

export const isKeycloakEnabled = Boolean(keycloakUrl);
