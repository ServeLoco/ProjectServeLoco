import { shadows } from './shadows';

// Admin-only presentation tokens. Customer, rider and shop-owner themes
// remain independent; the narrower gutter leaves room for operational data.
export const adminUi = {
  gutter: 12,
  canvas: '#F4F6FA',
  surface: '#FFFFFF',
  soft: '#EBEFF5',
  border: '#E2E8F0',
  text: '#162234',
  muted: '#64748B',
  hint: '#7C8AA0',
  active: '#162234',
  cardRadius: 18,
  controlRadius: 12,
  shadow: shadows.xs,
};
