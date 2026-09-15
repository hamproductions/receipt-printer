interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly BASE_URL: string;
  readonly VITE_STATIC_DEPLOY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
