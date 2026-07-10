/**
 * ServeLoco Theme — Central Export
 *
 * Import from here everywhere:
 *   import { colors, typography, spacing, radius, shadows, motion, layout } from '../../theme';
 */

export { colors } from './colors';
export { spacing } from './spacing';
export { typography, fontSizes, fontWeights, lineHeights } from './typography';
export { radius, borderWidth } from './borders';
export { shadows } from './shadows';
export {
  tapMs,
  smallMs,
  screenMs,
  staggerMs,
  loopMs,
  entryDistance,
  modalScaleStart,
  easing,
  easingModal,
  easingNone,
  motionConfig,
} from './motion';
export { layout } from './layout';

// `motion` namespace object (e.g. motion.tapMs, motion.easingModal) — matches
// the import shown in the file header so consumers can use motion.<token>.
import * as motion from './motion';
export { motion };
