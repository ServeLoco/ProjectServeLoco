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
  strokeWidth = 2,
  style,
}) {
  const Icon = ICONS[name] || Box;

  return (
    <Icon
      color={color}
      size={size}
      strokeWidth={strokeWidth}
      style={style}
    />
  );
}

export default AppIcon;
