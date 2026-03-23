import type { Color } from '@nolbul/engine';

/** SVG path symbols for each color — used on cards */
export const COLOR_SYMBOL: Record<Color, { path: string; viewBox: string }> = {
  red: {
    // Heart
    path: 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
    viewBox: '0 0 24 24',
  },
  yellow: {
    // Star
    path: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
    viewBox: '0 0 24 24',
  },
  green: {
    // Clover/Club
    path: 'M12 2C9.24 2 7 4.24 7 7c0 1.86 1.03 3.47 2.54 4.32-.36.62-.54 1.3-.54 2.01 0 2.21 1.79 4 4 4s4-1.79 4-4c0-.71-.18-1.39-.54-2.01C17.97 10.47 19 8.86 19 7c0-2.76-2.24-5-5-5h-2zm1 18h-2v2h2v-2z',
    viewBox: '0 0 24 24',
  },
  blue: {
    // Diamond
    path: 'M12 2L2 12l10 10 10-10L12 2z',
    viewBox: '0 0 24 24',
  },
  white: {
    // Circle/Moon
    path: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z',
    viewBox: '0 0 24 24',
  },
};
