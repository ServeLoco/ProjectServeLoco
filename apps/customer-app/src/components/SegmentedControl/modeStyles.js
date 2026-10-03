// Shared with the original circle selector so mode icons stay consistent.
const MODE_STYLE = {
  packed: { icon: 'home', color: '#FF6B6B' },
  house: { icon: 'home', color: '#FF6B6B' },
  fast_food: { icon: 'burger', color: '#FFD93D', iconColor: '#7D2D00' },
  sweets: { icon: 'cake', color: '#FF85B3' },
};
const FALLBACK_PALETTE = ['#FF6B6B', '#FFD93D', '#FF85B3', '#7FD1AE', '#8AB4FF'];

export const resolveModeStyle = (slug, index) =>
  MODE_STYLE[slug] || { icon: 'box', color: FALLBACK_PALETTE[index % FALLBACK_PALETTE.length] };
