import type { Color } from '@nolbul/engine';

export const COLOR_HEX: Record<Color, string> = {
  red: '#e74c3c',
  yellow: '#f1c40f',
  green: '#2ecc71',
  blue: '#3498db',
  white: '#ecf0f1',
};

/** Lighter shade for gradients (top of card) */
export const COLOR_HEX_LIGHT: Record<Color, string> = {
  red: '#ff6b6b',
  yellow: '#ffe066',
  green: '#69db7c',
  blue: '#74c0fc',
  white: '#f8f9fa',
};

/** Darker shade for gradients (bottom of card) */
export const COLOR_HEX_DARK: Record<Color, string> = {
  red: '#c0392b',
  yellow: '#d4a017',
  green: '#27ae60',
  blue: '#2980b9',
  white: '#bdc3c7',
};
