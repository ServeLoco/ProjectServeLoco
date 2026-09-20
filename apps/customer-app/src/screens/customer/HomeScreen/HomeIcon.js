import React from 'react';
import { AppIcon } from '../../../components';
import { ArrowDownIcon } from 'phosphor-react-native/src/icons/ArrowDown';
import { ArrowLeftIcon } from 'phosphor-react-native/src/icons/ArrowLeft';
import { ArrowUpIcon } from 'phosphor-react-native/src/icons/ArrowUp';
import { ArrowsOutIcon } from 'phosphor-react-native/src/icons/ArrowsOut';
import { AtIcon } from 'phosphor-react-native/src/icons/At';
import { BellIcon } from 'phosphor-react-native/src/icons/Bell';
import { CakeIcon } from 'phosphor-react-native/src/icons/Cake';
import { CaretDownIcon } from 'phosphor-react-native/src/icons/CaretDown';
import { CaretRightIcon } from 'phosphor-react-native/src/icons/CaretRight';
import { CheckIcon } from 'phosphor-react-native/src/icons/Check';
import { ClockIcon } from 'phosphor-react-native/src/icons/Clock';
import { CreditCardIcon } from 'phosphor-react-native/src/icons/CreditCard';
import { CrosshairIcon } from 'phosphor-react-native/src/icons/Crosshair';
import { CurrencyInrIcon } from 'phosphor-react-native/src/icons/CurrencyInr';
import { EnvelopeIcon } from 'phosphor-react-native/src/icons/Envelope';
import { EyeIcon } from 'phosphor-react-native/src/icons/Eye';
import { EyeSlashIcon } from 'phosphor-react-native/src/icons/EyeSlash';
import { GearIcon } from 'phosphor-react-native/src/icons/Gear';
import { HamburgerIcon } from 'phosphor-react-native/src/icons/Hamburger';
import { HandbagIcon } from 'phosphor-react-native/src/icons/Handbag';
import { HeartIcon } from 'phosphor-react-native/src/icons/Heart';
import { HouseIcon } from 'phosphor-react-native/src/icons/House';
import { ImageIcon } from 'phosphor-react-native/src/icons/Image';
import { LockIcon } from 'phosphor-react-native/src/icons/Lock';
import { MagnifyingGlassIcon } from 'phosphor-react-native/src/icons/MagnifyingGlass';
import { MapPinIcon } from 'phosphor-react-native/src/icons/MapPin';
import { MinusIcon } from 'phosphor-react-native/src/icons/Minus';
import { NavigationArrowIcon } from 'phosphor-react-native/src/icons/NavigationArrow';
import { PackageIcon } from 'phosphor-react-native/src/icons/Package';
import { PencilSimpleIcon } from 'phosphor-react-native/src/icons/PencilSimple';
import { PhoneIcon } from 'phosphor-react-native/src/icons/Phone';
import { PlusIcon } from 'phosphor-react-native/src/icons/Plus';
import { ShoppingCartIcon } from 'phosphor-react-native/src/icons/ShoppingCart';
import { SignOutIcon } from 'phosphor-react-native/src/icons/SignOut';
import { StarIcon } from 'phosphor-react-native/src/icons/Star';
import { TicketIcon } from 'phosphor-react-native/src/icons/Ticket';
import { TrashIcon } from 'phosphor-react-native/src/icons/Trash';
import { TrendUpIcon } from 'phosphor-react-native/src/icons/TrendUp';
import { UploadSimpleIcon } from 'phosphor-react-native/src/icons/UploadSimple';
import { UserIcon } from 'phosphor-react-native/src/icons/User';
import { UsersIcon } from 'phosphor-react-native/src/icons/Users';
import { WarningIcon } from 'phosphor-react-native/src/icons/Warning';
import { WhatsappLogoIcon } from 'phosphor-react-native/src/icons/WhatsappLogo';
import { XIcon } from 'phosphor-react-native/src/icons/X';

// Home-only icon set (Phosphor). Every other screen keeps AppIcon's Lucide
// icons. Icons are imported one by one so Metro doesn't bundle the whole
// library. Any name not listed here (admin-chosen section icons) falls back
// to AppIcon, so an unknown name can never render nothing.
const PHOSPHOR_ICONS = {
  add: PlusIcon,
  back: ArrowLeftIcon,
  box: PackageIcon,
  burger: HamburgerIcon,
  cake: CakeIcon,
  cart: ShoppingCartIcon,
  check: CheckIcon,
  clock: ClockIcon,
  close: XIcon,
  creditCard: CreditCardIcon,
  delete: TrashIcon,
  down: CaretDownIcon,
  chevronRight: CaretRightIcon,
  moveDown: ArrowDownIcon,
  moveUp: ArrowUpIcon,
  edit: GearIcon,
  eye: EyeIcon,
  eyeOff: EyeSlashIcon,
  expand: ArrowsOutIcon,
  home: HouseIcon,
  heart: HeartIcon,
  atsign: AtIcon,
  mail: EnvelopeIcon,
  image: ImageIcon,
  rupee: CurrencyInrIcon,
  location: MapPinIcon,
  locate: CrosshairIcon,
  lock: LockIcon,
  logout: SignOutIcon,
  map: MapPinIcon,
  minus: MinusIcon,
  navigation: NavigationArrowIcon,
  notification: BellIcon,
  orders: PackageIcon,
  analytics: TrendUpIcon,
  people: UsersIcon,
  pencil: PencilSimpleIcon,
  phone: PhoneIcon,
  profile: UserIcon,
  search: MagnifyingGlassIcon,
  shoppingBag: HandbagIcon,
  star: StarIcon,
  settings: GearIcon,
  ticket: TicketIcon,
  upload: UploadSimpleIcon,
  warning: WarningIcon,
  whatsapp: WhatsappLogoIcon,
};

// AppIcon props are kept 1:1 so a Home call site only swaps the component
// name. Home icons are always bold — a caller can still pass `weight`
// explicitly, but strokeWidth and fill (Lucide concepts) no longer change it.
function HomeIcon({ name, size = 20, color, strokeWidth, fill, weight = 'bold', style }) {
  const Icon = PHOSPHOR_ICONS[name];
  if (!Icon) {
    return <AppIcon name={name} size={size} color={color} strokeWidth={strokeWidth} fill={fill} style={style} />;
  }
  return <Icon size={size} color={color} weight={weight} style={style} />;
}

export default HomeIcon;
