import type { Color } from '../types';

export const COLORS: readonly Color[] = ['coral', 'amber', 'pine', 'iris', 'pearl'];

// Internal color names are stylized (coral / amber / pine / iris / pearl) so
// they double as branding. Plain-English names for UI text (card descriptions,
// aria labels, etc.) — the colors on screen don't change, just what we *call*
// them when explaining rules to the player.
export const COLOR_DISPLAY_NAME: Record<Color, string> = {
  coral: 'red',
  amber: 'yellow',
  pine: 'green',
  iris: 'purple',
  pearl: 'white',
};

type Gradient = { light: string; base: string; dark: string; hex: number };

export const COLOR_GRADIENTS: Record<Color, Gradient> = {
  coral: { light: '#FECDD3', base: '#F43F5E', dark: '#881337', hex: 0xF43F5E },
  amber: { light: '#FDE68A', base: '#F59E0B', dark: '#78350F', hex: 0xF59E0B },
  pine:  { light: '#6EE7B7', base: '#047857', dark: '#064E3B', hex: 0x047857 },
  iris:  { light: '#C4B5FD', base: '#7C3AED', dark: '#4C1D95', hex: 0x7C3AED },
  pearl: { light: '#FAFAF9', base: '#D6D3D1', dark: '#78716C', hex: 0xD6D3D1 },
};

// Ceramic / porcelain: soft light highlight at upper-left (clearcoat catching
// the key light), base color across the body, dark rolloff at the edge.
// Mirrors the 3D MeshPhysicalMaterial (matte body + clearcoat).
export function sphereGradientStyle(c: Color): string {
  const g = COLOR_GRADIENTS[c];
  return `radial-gradient(circle at 35% 28%, ${g.light} 0%, ${g.base} 35%, ${g.dark} 100%)`;
}
