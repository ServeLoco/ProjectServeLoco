import React from 'react';
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Box,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  Home,
  Image as ImageIcon,
  Lock,
  LogOut,
  MapPin,
  MessageCircle,
  Minus,
  Package,
  Phone,
  Plus,
  Search,
  Settings,
  ShoppingCart,
  Trash2,
  Upload,
  User,
  X,
} from 'lucide-react-native';
import { colors } from '../../theme';

const ICONS = {
  add: Plus,
  back: ArrowLeft,
  box: Box,
  cart: ShoppingCart,
  check: Check,
  close: X,
  delete: Trash2,
  down: ChevronDown,
  moveDown: ArrowDown,
  moveUp: ArrowUp,
  edit: Settings,
  eye: Eye,
  eyeOff: EyeOff,
  home: Home,
  image: ImageIcon,
  location: MapPin,
  lock: Lock,
  logout: LogOut,
  map: MapPin,
  minus: Minus,
  orders: Package,
  phone: Phone,
  profile: User,
  search: Search,
  settings: Settings,
  upload: Upload,
  whatsapp: MessageCircle,
};

function AppIcon({
  name,
  color = colors.textPrimary,
  size = 20,
  strokeWidth,
  style,
}) {
  const Icon = ICONS[name] || Box;

  // Dynamic stroke weight for enhanced legibility: thicker for small sizes, elegant for larger ones.
  const resolvedStrokeWidth = strokeWidth !== undefined
    ? strokeWidth
    : size <= 16
    ? 2.2
    : size >= 24
    ? 1.8
    : 2;

  return (
    <Icon
      color={color}
      size={size}
      strokeWidth={resolvedStrokeWidth}
      style={style}
    />
  );
}

export default AppIcon;
