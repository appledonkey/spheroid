/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SHARE_URL?: string;
  // PartyKit host, including protocol-less authority (e.g. "spheroids-party.appledonkey.partykit.dev").
  // Defaults to localhost:1999 in the hook so `npx partykit dev` works out of the box.
  readonly VITE_PARTYKIT_HOST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
