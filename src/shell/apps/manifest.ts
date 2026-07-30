import type { AppDef } from './types';

function requireText(value: string, label: string): void {
  if (value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
}

function requireTier(tier: number, label: string): void {
  if (!Number.isSafeInteger(tier) || tier < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer.`);
  }
}

export function loadManifest(
  definitions: readonly AppDef[],
): readonly AppDef[] {
  const ids = new Set<string>();
  const loaded = definitions.map((definition, index) => {
    const label = `App at index ${String(index)}`;
    requireText(definition.id, `${label} id`);
    requireText(definition.title, `${label} title`);
    requireText(definition.icon, `${label} icon`);
    requireTier(definition.tier_required, `${label} tier_required`);

    if (ids.has(definition.id)) {
      throw new Error(`Duplicate app id "${definition.id}".`);
    }

    ids.add(definition.id);
    return Object.freeze({ ...definition });
  });

  return Object.freeze(loaded);
}

export function appsForTier(
  manifest: readonly AppDef[],
  currentTier: number,
): readonly AppDef[] {
  requireTier(currentTier, 'Current tier');
  return Object.freeze(
    manifest.filter(
      (definition) => definition.tier_required <= currentTier,
    ),
  );
}
