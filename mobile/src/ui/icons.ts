import type { AndroidSymbol, SFSymbol } from 'expo-symbols';
import type { LucideIcon } from 'lucide-react-native';
import BanIcon from 'lucide-react-native/icons/ban';
import BellIcon from 'lucide-react-native/icons/bell';
import BuildingIcon from 'lucide-react-native/icons/building';
import CalendarDaysIcon from 'lucide-react-native/icons/calendar-days';
import CarFrontIcon from 'lucide-react-native/icons/car-front';
import CheckIcon from 'lucide-react-native/icons/check';
import ChevronDownIcon from 'lucide-react-native/icons/chevron-down';
import ChevronLeftIcon from 'lucide-react-native/icons/chevron-left';
import ChevronRightIcon from 'lucide-react-native/icons/chevron-right';
import CircleAlertIcon from 'lucide-react-native/icons/circle-alert';
import CircleUserRoundIcon from 'lucide-react-native/icons/circle-user-round';
import ClockIcon from 'lucide-react-native/icons/clock';
import CloudOffIcon from 'lucide-react-native/icons/cloud-off';
import CreditCardIcon from 'lucide-react-native/icons/credit-card';
import EllipsisIcon from 'lucide-react-native/icons/ellipsis';
import ExternalLinkIcon from 'lucide-react-native/icons/external-link';
import GlobeIcon from 'lucide-react-native/icons/globe';
import HouseIcon from 'lucide-react-native/icons/house';
import InboxIcon from 'lucide-react-native/icons/inbox';
import InfoIcon from 'lucide-react-native/icons/info';
import LinkIcon from 'lucide-react-native/icons/link';
import LockIcon from 'lucide-react-native/icons/lock';
import LogInIcon from 'lucide-react-native/icons/log-in';
import LogOutIcon from 'lucide-react-native/icons/log-out';
import MailIcon from 'lucide-react-native/icons/mail';
import MenuIcon from 'lucide-react-native/icons/menu';
import MinusIcon from 'lucide-react-native/icons/minus';
import MoonIcon from 'lucide-react-native/icons/moon';
import PencilIcon from 'lucide-react-native/icons/pencil';
import PhoneIcon from 'lucide-react-native/icons/phone';
import PlusIcon from 'lucide-react-native/icons/plus';
import RefreshCwIcon from 'lucide-react-native/icons/refresh-cw';
import SearchIcon from 'lucide-react-native/icons/search';
import SettingsIcon from 'lucide-react-native/icons/settings';
import ShieldCheckIcon from 'lucide-react-native/icons/shield-check';
import TrashIcon from 'lucide-react-native/icons/trash';
import UserRoundIcon from 'lucide-react-native/icons/user-round';
import UsersIcon from 'lucide-react-native/icons/users';
import WalletIcon from 'lucide-react-native/icons/wallet';
import XIcon from 'lucide-react-native/icons/x';
import { I18nManager } from 'react-native';

/**
 * Icons used by the app, imported one file each. Metro does not tree-shake, so
 * importing from the package root would ship every Lucide icon. Add a concept
 * here (`sf`, `md` and `lucide`), run `npm run icons:gen`, then use it through
 * `<Icon name=… />`.
 */
export type IconName =
  | 'back'
  | 'forward'
  | 'close'
  | 'check'
  | 'search'
  | 'home'
  | 'calendar'
  | 'clock'
  | 'customer'
  | 'customers'
  | 'wallet'
  | 'menu'
  | 'building'
  | 'phone'
  | 'mail'
  | 'password'
  | 'security'
  | 'cancel'
  | 'inbox'
  | 'offline'
  | 'error'
  | 'theme'
  | 'externalLink'
  | 'signOut'
  | 'chevronDown'
  | 'add'
  | 'remove'
  | 'edit'
  | 'bell'
  | 'car'
  | 'user'
  | 'link'
  | 'settings'
  | 'trash'
  | 'refresh'
  | 'signIn'
  | 'more'
  | 'card'
  | 'info'
  | 'language';

/** `sf` on iOS, `md` (Material Symbols, the font expo-symbols bundles) on Android, Lucide where neither draws. */
type Entry = { sf: SFSymbol; md: AndroidSymbol; lucide: LucideIcon; minIOS?: number };

export const ICONS: Record<IconName, Entry> = {
  back: { sf: 'chevron.left', md: 'arrow_back', lucide: ChevronLeftIcon },
  forward: { sf: 'chevron.right', md: 'chevron_right', lucide: ChevronRightIcon },
  close: { sf: 'xmark', md: 'close', lucide: XIcon },
  check: { sf: 'checkmark', md: 'check', lucide: CheckIcon },
  search: { sf: 'magnifyingglass', md: 'search', lucide: SearchIcon },
  home: { sf: 'house', md: 'home', lucide: HouseIcon },
  calendar: { sf: 'calendar', md: 'calendar_month', lucide: CalendarDaysIcon },
  clock: { sf: 'clock', md: 'schedule', lucide: ClockIcon },
  customer: { sf: 'person', md: 'person', lucide: UserRoundIcon },
  customers: { sf: 'person.2', md: 'group', lucide: UsersIcon },
  wallet: { sf: 'wallet.pass', md: 'account_balance_wallet', lucide: WalletIcon },
  menu: { sf: 'line.3.horizontal', md: 'menu', lucide: MenuIcon },
  building: { sf: 'building.2', md: 'apartment', lucide: BuildingIcon },
  phone: { sf: 'phone', md: 'call', lucide: PhoneIcon },
  mail: { sf: 'envelope', md: 'mail', lucide: MailIcon },
  password: { sf: 'lock', md: 'lock', lucide: LockIcon },
  security: { sf: 'checkmark.shield', md: 'verified_user', lucide: ShieldCheckIcon },
  cancel: { sf: 'nosign', md: 'block', lucide: BanIcon },
  inbox: { sf: 'tray', md: 'inbox', lucide: InboxIcon },
  offline: { sf: 'icloud.slash', md: 'cloud_off', lucide: CloudOffIcon },
  error: { sf: 'exclamationmark.circle', md: 'error', lucide: CircleAlertIcon },
  theme: { sf: 'moon', md: 'dark_mode', lucide: MoonIcon },
  externalLink: { sf: 'arrow.up.right.square', md: 'open_in_new', lucide: ExternalLinkIcon },
  signOut: { sf: 'rectangle.portrait.and.arrow.right', md: 'logout', lucide: LogOutIcon },
  chevronDown: { sf: 'chevron.down', md: 'expand_more', lucide: ChevronDownIcon },
  add: { sf: 'plus', md: 'add', lucide: PlusIcon },
  remove: { sf: 'minus', md: 'remove', lucide: MinusIcon },
  edit: { sf: 'pencil', md: 'edit', lucide: PencilIcon },
  bell: { sf: 'bell', md: 'notifications', lucide: BellIcon },
  car: { sf: 'car', md: 'directions_car', lucide: CarFrontIcon },
  user: { sf: 'person.crop.circle', md: 'account_circle', lucide: CircleUserRoundIcon },
  link: { sf: 'link', md: 'link', lucide: LinkIcon },
  settings: { sf: 'gearshape', md: 'settings', lucide: SettingsIcon },
  trash: { sf: 'trash', md: 'delete', lucide: TrashIcon },
  refresh: { sf: 'arrow.clockwise', md: 'refresh', lucide: RefreshCwIcon },
  signIn: { sf: 'arrow.right.circle', md: 'login', lucide: LogInIcon },
  more: { sf: 'ellipsis.circle', md: 'more_horiz', lucide: EllipsisIcon },
  card: { sf: 'creditcard', md: 'credit_card', lucide: CreditCardIcon },
  info: { sf: 'info.circle', md: 'info', lucide: InfoIcon },
  language: { sf: 'globe', md: 'language', lucide: GlobeIcon },
};
/** Lucide glyph for a concept; `back`/`forward` mirror in RTL. */
export function lucideFor(name: IconName): LucideIcon {
  if (I18nManager.isRTL && name === 'back') return ChevronRightIcon;
  if (I18nManager.isRTL && name === 'forward') return ChevronLeftIcon;
  return ICONS[name].lucide;
}
