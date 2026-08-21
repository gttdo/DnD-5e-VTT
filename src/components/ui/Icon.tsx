import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  ChevronLeft,
  Plus,
  Minus,
  X,
  Star,
  Palette,
  Drama,
  Library,
  Trash2,
  Settings,
  LogOut,
  Users,
  User,
  Swords,
  Map as MapIcon,
  Image as ImageIcon,
  Sparkles,
  Copy,
  Check,
  RotateCcw,
  RotateCw,
  Maximize,
  ZoomIn,
  ZoomOut,
  MousePointer2,
  Hand,
  Ruler,
  Target,
  Pencil,
  Dice6,
  Sun,
  Moon,
  MoreVertical,
  SquarePen,
  LayoutGrid,
  Flame,
  TriangleAlert,
  Shield,
  BookOpen,
  ScrollText,
  Eye,
  EyeOff,
  CloudFog,
  Square,
  Circle,
  MoveUpRight,
  Eraser,
  Smartphone,
  Search,
  Package,
} from "lucide-react";

/**
 * Thin wrapper over lucide-react so consumers never import lucide directly.
 * If we ever swap icon libraries, only this file changes.
 *
 * Naming is intent-first ("delete" not "trash", "back" not "arrow-left") so
 * call sites read like sentences. Add new names by mapping intent → glyph
 * inside REGISTRY below.
 */

const REGISTRY = {
  // Nav / structure
  back: ArrowLeft,
  forward: ArrowRight,
  down: ChevronDown,
  up: ChevronUp,
  right: ChevronRight,
  left: ChevronLeft,
  close: X,
  more: MoreVertical,
  grid: LayoutGrid,
  rest: Flame,
  add: Plus,
  remove: Minus,
  check: Check,
  copy: Copy,
  settings: Settings,
  "sign-out": LogOut,
  fullscreen: Maximize,

  // Content / features
  palette: Palette,
  drama: Drama,
  library: Library,
  map: MapIcon,
  image: ImageIcon,
  sparkles: Sparkles,
  users: Users,
  user: User,
  swords: Swords,
  dice: Dice6,
  star: Star,
  alert: TriangleAlert,
  shield: Shield,
  rules: BookOpen,
  story: ScrollText,
  eye: Eye,
  "eye-off": EyeOff,
  fog: CloudFog,
  rect: Square,
  ellipse: Circle,
  arrow: MoveUpRight,
  eraser: Eraser,
  smartphone: Smartphone,
  edit: SquarePen,
  delete: Trash2,
  search: Search,
  package: Package,

  // Canvas tools
  select: MousePointer2,
  pan: Hand,
  ruler: Ruler,
  ping: Target,
  draw: Pencil,
  "zoom-in": ZoomIn,
  "zoom-out": ZoomOut,
  reset: RotateCcw,
  rotate: RotateCw,

  // Theme
  sun: Sun,
  moon: Moon,
} as const;

export type IconName = keyof typeof REGISTRY;

interface Props {
  name: IconName;
  size?: number | string;
  strokeWidth?: number;
  className?: string;
  style?: React.CSSProperties;
  "aria-label"?: string;
}

export const Icon = ({
  name,
  size = 16,
  strokeWidth = 2,
  className,
  style,
  "aria-label": ariaLabel,
}: Props) => {
  const Lucide = REGISTRY[name];
  return (
    <Lucide
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      style={{ flexShrink: 0, ...style }}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
    />
  );
};
