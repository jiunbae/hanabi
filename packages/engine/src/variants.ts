import type { Color, VariantName } from './types.js';
import { COLORS } from './constants.js';

export interface VariantConfig {
  readonly name: VariantName;
  readonly colors: readonly Color[];
}

const STANDARD: VariantConfig = {
  name: 'standard',
  colors: COLORS,
};

const VARIANTS: Record<VariantName, VariantConfig> = {
  standard: STANDARD,
};

export function getVariant(name: VariantName = 'standard'): VariantConfig {
  return VARIANTS[name];
}
