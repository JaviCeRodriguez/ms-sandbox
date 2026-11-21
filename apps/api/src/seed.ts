/** Contoso demo seed — fixed GUIDs from the product PRD. */

export const TENANT_ID = "11111111-1111-1111-1111-111111111111";
export const ALICE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1";
export const BOB_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2";
export const SPA_APP_ID = "cccccccc-cccc-cccc-cccc-ccccccccccc1";

export type User = {
  id: string;
  tenantId: string;
  userPrincipalName: string;
  displayName: string;
  password: string;
};

export type Application = {
  appId: string;
  tenantId: string;
  displayName: string;
  publicClient: boolean;
  redirectUris: string[];
  requiredDelegatedScopes: string[];
};

export type Consent = {
  appId: string;
  principalUpn: string | "admin";
  scopes: string[];
};

export type Tenant = {
  id: string;
  displayName: string;
  defaultDomain: string;
};

export const tenant: Tenant = {
  id: TENANT_ID,
  displayName: "Contoso Ltd",
  defaultDomain: "contoso.test",
};

export const users: User[] = [
  {
    id: ALICE_ID,
    tenantId: TENANT_ID,
    userPrincipalName: "alice@contoso.test",
    displayName: "Alice Contoso",
    password: "Password1!",
  },
  {
    id: BOB_ID,
    tenantId: TENANT_ID,
    userPrincipalName: "bob@contoso.test",
    displayName: "Bob Contoso",
    password: "Password1!",
  },
];

export const applications: Application[] = [
  {
    appId: SPA_APP_ID,
    tenantId: TENANT_ID,
    displayName: "ms-sandbox demo SPA",
    publicClient: true,
    redirectUris: [
      "http://localhost:5173",
      "http://localhost:5173/",
      "http://127.0.0.1:5173",
      "http://127.0.0.1:5173/",
    ],
    requiredDelegatedScopes: ["openid", "profile", "offline_access", "User.Read"],
  },
];

export const consents: Consent[] = [
  {
    appId: SPA_APP_ID,
    principalUpn: "alice@contoso.test",
    scopes: ["openid", "profile", "offline_access", "User.Read"],
  },
];
