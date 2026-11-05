import { APPS, buildApp } from './apps/registry';

export type Preset = { id: string; name: string; hint: string; build: () => ReturnType<typeof buildApp> };

export const PRESETS: Preset[] = APPS.map((app) => ({ id: app.id, name: app.name, hint: app.hint, build: () => buildApp(app) }));
