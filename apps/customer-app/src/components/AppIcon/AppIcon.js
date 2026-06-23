import React from 'react';
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Bell,
  Box,
  Check,
  ChevronDown,
  ChevronRight,
  CreditCard,
  Eye,
  EyeOff,
  Home,
  Heart,
  AtSign,
  Image as ImageIcon,
  IndianRupee,
  Mail,
  Lock,
  LogOut,
  MapPin,
  MessageCircle,
  Minus,
  Navigation,
  Package,
  Phone,
  Plus,
  Search,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Star,
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
  creditCard: CreditCard,
  delete: Trash2,
  down: ChevronDown,
  chevronRight: ChevronRight,
  moveDown: ArrowDown,
  moveUp: ArrowUp,
  edit: Settings,
  eye: Eye,
  eyeOff: EyeOff,
  home: Home,
  heart: Heart,
  atsign: AtSign,
  mail: Mail,
  image: ImageIcon,
  rupee: IndianRupee,
  location: MapPin,
  lock: Lock,
  logout: LogOut,
  map: MapPin,
  minus: Minus,
  navigation: Navigation,
  notification: Bell,
  orders: Package,
  phone: Phone,
  profile: User,
  search: Search,
  shoppingBag: ShoppingBag,
  star: Star,
  settings: Settings,
  upload: Upload,
  whatsapp: MessageCircle,
};

function AppIcon({
  name,
  color = colors.textPrimary,
  size = 20,
  strokeWidth,
  fill,
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
      fill={fill !== undefined ? fill : 'none'}
      style={style}
    />
  );
}

export default AppIcon;
