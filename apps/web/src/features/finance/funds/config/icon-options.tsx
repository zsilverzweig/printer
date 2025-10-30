/**
 * Icon and Color Options for Funds
 *
 * Provides preset icon and color options for fund customization.
 */

import {
  Activity,
  AlarmClock,
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowDownRight,
  // Growth and Movement icons
  ArrowUp,
  ArrowUpRight,
  Award,
  BadgeDollarSign,
  Banknote,
  // Chart and Analytics icons
  BarChart,
  BarChart2,
  BarChart3,
  BarChart4,
  // Objects and Symbols icons
  Box,
  Boxes,
  // Technology icons
  Brain,
  BrainCircuit,
  Briefcase,
  Calculator,
  Calendar,
  CalendarClock,
  Circle,
  CircleArrowDown,
  CircleArrowUp,
  CircleDollarSign,
  // Time and Timing icons
  Clock,
  Coins,
  Cpu,
  // Additional financial icons
  CreditCard,
  // Strategy and Planning icons
  Crosshair,
  Crown,
  Diamond,
  DollarSign,
  Eye,
  Filter,
  Flame,
  Focus,
  // Action and Performance icons
  Gauge,
  GaugeCircle,
  Gem,
  Grid,
  HandCoins,
  Hexagon,
  Hourglass,
  Landmark,
  Layers,
  LineChart,
  Lock,
  LucideIcon,
  Medal,
  Moon,
  MoveDown,
  MoveUp,
  Network,
  Octagon,
  Package,
  Pentagon,
  PieChart,
  PiggyBank,
  Receipt,
  Rocket,
  Scan,
  Search,
  Settings,
  // Risk and Security icons
  Shield,
  ShieldCheck,
  Sliders,
  SlidersHorizontal,
  Sparkles,
  Square,
  Star,
  Sun,
  Sunrise,
  Sunset,
  Target,
  Timer,
  TrendingDown,
  TrendingUp,
  TrendingUpDown,
  Triangle,
  Trophy,
  Unlock,
  Wallet,
  Wind,
  Workflow,
  Zap,
} from "lucide-react";

export interface IconOption {
  name: string;
  icon: LucideIcon;
  label: string;
}

export interface ColorOption {
  name: string;
  label: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
}

export const ICON_OPTIONS: IconOption[] = [
  // Financial & Money
  { name: "Wallet", icon: Wallet, label: "Wallet" },
  { name: "DollarSign", icon: DollarSign, label: "Dollar Sign" },
  { name: "Coins", icon: Coins, label: "Coins" },
  { name: "CreditCard", icon: CreditCard, label: "Credit Card" },
  { name: "Banknote", icon: Banknote, label: "Banknote" },
  { name: "PiggyBank", icon: PiggyBank, label: "Piggy Bank" },
  { name: "Landmark", icon: Landmark, label: "Bank" },
  { name: "HandCoins", icon: HandCoins, label: "Hand Coins" },
  { name: "BadgeDollarSign", icon: BadgeDollarSign, label: "Badge Dollar" },
  { name: "CircleDollarSign", icon: CircleDollarSign, label: "Circle Dollar" },

  // Trends & Movements
  { name: "TrendingUp", icon: TrendingUp, label: "Trending Up" },
  { name: "TrendingDown", icon: TrendingDown, label: "Trending Down" },
  { name: "TrendingUpDown", icon: TrendingUpDown, label: "Trending Both" },
  { name: "ArrowUp", icon: ArrowUp, label: "Arrow Up" },
  { name: "ArrowDown", icon: ArrowDown, label: "Arrow Down" },
  { name: "ArrowUpRight", icon: ArrowUpRight, label: "Arrow Up Right" },
  { name: "ArrowDownRight", icon: ArrowDownRight, label: "Arrow Down Right" },
  { name: "MoveUp", icon: MoveUp, label: "Move Up" },
  { name: "MoveDown", icon: MoveDown, label: "Move Down" },
  { name: "CircleArrowUp", icon: CircleArrowUp, label: "Circle Arrow Up" },
  {
    name: "CircleArrowDown",
    icon: CircleArrowDown,
    label: "Circle Arrow Down",
  },

  // Charts & Analytics
  { name: "BarChart", icon: BarChart, label: "Bar Chart" },
  { name: "BarChart2", icon: BarChart2, label: "Bar Chart Alt" },
  { name: "BarChart3", icon: BarChart3, label: "Bar Chart 3" },
  { name: "BarChart4", icon: BarChart4, label: "Bar Chart 4" },
  { name: "LineChart", icon: LineChart, label: "Line Chart" },
  { name: "PieChart", icon: PieChart, label: "Pie Chart" },
  { name: "Activity", icon: Activity, label: "Activity" },

  // Performance & Goals
  { name: "Target", icon: Target, label: "Target" },
  { name: "Gauge", icon: Gauge, label: "Gauge" },
  { name: "GaugeCircle", icon: GaugeCircle, label: "Gauge Circle" },
  { name: "Award", icon: Award, label: "Award" },
  { name: "Trophy", icon: Trophy, label: "Trophy" },
  { name: "Medal", icon: Medal, label: "Medal" },
  { name: "Star", icon: Star, label: "Star" },
  { name: "Crown", icon: Crown, label: "Crown" },

  // Energy & Power
  { name: "Zap", icon: Zap, label: "Lightning" },
  { name: "Flame", icon: Flame, label: "Flame" },
  { name: "Rocket", icon: Rocket, label: "Rocket" },
  { name: "Sparkles", icon: Sparkles, label: "Sparkles" },

  // Strategy & Analysis
  { name: "Crosshair", icon: Crosshair, label: "Crosshair" },
  { name: "Focus", icon: Focus, label: "Focus" },
  { name: "Eye", icon: Eye, label: "Eye" },
  { name: "Scan", icon: Scan, label: "Scan" },
  { name: "Search", icon: Search, label: "Search" },
  { name: "Filter", icon: Filter, label: "Filter" },
  { name: "Settings", icon: Settings, label: "Settings" },
  { name: "Sliders", icon: Sliders, label: "Sliders" },
  { name: "SlidersHorizontal", icon: SlidersHorizontal, label: "Sliders H" },
  { name: "Calculator", icon: Calculator, label: "Calculator" },

  // Business & Work
  { name: "Briefcase", icon: Briefcase, label: "Briefcase" },
  { name: "Receipt", icon: Receipt, label: "Receipt" },
  { name: "Package", icon: Package, label: "Package" },
  { name: "Box", icon: Box, label: "Box" },
  { name: "Boxes", icon: Boxes, label: "Boxes" },

  // Technology & AI
  { name: "Brain", icon: Brain, label: "Brain" },
  { name: "BrainCircuit", icon: BrainCircuit, label: "AI Brain" },
  { name: "Cpu", icon: Cpu, label: "CPU" },
  { name: "Network", icon: Network, label: "Network" },
  { name: "Workflow", icon: Workflow, label: "Workflow" },

  // Time & Timing
  { name: "Clock", icon: Clock, label: "Clock" },
  { name: "Timer", icon: Timer, label: "Timer" },
  { name: "Hourglass", icon: Hourglass, label: "Hourglass" },
  { name: "Calendar", icon: Calendar, label: "Calendar" },
  { name: "CalendarClock", icon: CalendarClock, label: "Calendar Clock" },
  { name: "AlarmClock", icon: AlarmClock, label: "Alarm" },

  // Security & Risk
  { name: "Shield", icon: Shield, label: "Shield" },
  { name: "ShieldCheck", icon: ShieldCheck, label: "Shield Check" },
  { name: "Lock", icon: Lock, label: "Lock" },
  { name: "Unlock", icon: Unlock, label: "Unlock" },
  { name: "AlertTriangle", icon: AlertTriangle, label: "Alert" },
  { name: "AlertCircle", icon: AlertCircle, label: "Alert Circle" },

  // Nature & Elements
  { name: "Sun", icon: Sun, label: "Sun" },
  { name: "Moon", icon: Moon, label: "Moon" },
  { name: "Wind", icon: Wind, label: "Wind" },
  { name: "Sunrise", icon: Sunrise, label: "Sunrise" },
  { name: "Sunset", icon: Sunset, label: "Sunset" },

  // Shapes & Objects
  { name: "Gem", icon: Gem, label: "Gem" },
  { name: "Diamond", icon: Diamond, label: "Diamond" },
  { name: "Layers", icon: Layers, label: "Layers" },
  { name: "Grid", icon: Grid, label: "Grid" },
  { name: "Circle", icon: Circle, label: "Circle" },
  { name: "Square", icon: Square, label: "Square" },
  { name: "Triangle", icon: Triangle, label: "Triangle" },
  { name: "Hexagon", icon: Hexagon, label: "Hexagon" },
  { name: "Octagon", icon: Octagon, label: "Octagon" },
  { name: "Pentagon", icon: Pentagon, label: "Pentagon" },
];

// Dark theme friendly colors
export const COLOR_OPTIONS: ColorOption[] = [
  {
    name: "blue",
    label: "Blue",
    bgClass: "bg-blue-500/20",
    textClass: "text-blue-400",
    borderClass: "border-blue-500",
  },
  {
    name: "green",
    label: "Green",
    bgClass: "bg-green-500/20",
    textClass: "text-green-400",
    borderClass: "border-green-500",
  },
  {
    name: "purple",
    label: "Purple",
    bgClass: "bg-purple-500/20",
    textClass: "text-purple-400",
    borderClass: "border-purple-500",
  },
  {
    name: "pink",
    label: "Pink",
    bgClass: "bg-pink-500/20",
    textClass: "text-pink-400",
    borderClass: "border-pink-500",
  },
  {
    name: "orange",
    label: "Orange",
    bgClass: "bg-orange-500/20",
    textClass: "text-orange-400",
    borderClass: "border-orange-500",
  },
  {
    name: "yellow",
    label: "Yellow",
    bgClass: "bg-yellow-500/20",
    textClass: "text-yellow-400",
    borderClass: "border-yellow-500",
  },
  {
    name: "cyan",
    label: "Cyan",
    bgClass: "bg-cyan-500/20",
    textClass: "text-cyan-400",
    borderClass: "border-cyan-500",
  },
  {
    name: "red",
    label: "Red",
    bgClass: "bg-red-500/20",
    textClass: "text-red-400",
    borderClass: "border-red-500",
  },
  {
    name: "emerald",
    label: "Emerald",
    bgClass: "bg-emerald-500/20",
    textClass: "text-emerald-400",
    borderClass: "border-emerald-500",
  },
  {
    name: "indigo",
    label: "Indigo",
    bgClass: "bg-indigo-500/20",
    textClass: "text-indigo-400",
    borderClass: "border-indigo-500",
  },
  {
    name: "rose",
    label: "Rose",
    bgClass: "bg-rose-500/20",
    textClass: "text-rose-400",
    borderClass: "border-rose-500",
  },
  {
    name: "amber",
    label: "Amber",
    bgClass: "bg-amber-500/20",
    textClass: "text-amber-400",
    borderClass: "border-amber-500",
  },
];

/**
 * Get icon component by name
 */
export function getIconByName(iconName?: string): LucideIcon {
  const option = ICON_OPTIONS.find((opt) => opt.name === iconName);
  return option?.icon || Wallet;
}

/**
 * Get color classes by color name
 */
export function getColorClasses(colorName?: string): ColorOption {
  const option = COLOR_OPTIONS.find((opt) => opt.name === colorName);
  return (
    option || {
      name: "blue",
      label: "Blue",
      bgClass: "bg-blue-500/20",
      textClass: "text-blue-400",
      borderClass: "border-blue-500",
    }
  );
}
