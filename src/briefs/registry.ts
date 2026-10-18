import type { BriefDefinition } from './types';

const modules = import.meta.glob<{ default?: BriefDefinition }>(
  ['./*.ts', '!./types.ts', '!./registry.ts', '!./*.test.ts'],
  { eager: true },
);

const briefs = new Map<string, BriefDefinition>();
for (const mod of Object.values(modules)) {
  if (mod.default?.slug) briefs.set(mod.default.slug, mod.default);
}

export function getBrief(slug: string | undefined): BriefDefinition | null {
  return (slug && briefs.get(slug)) || null;
}
