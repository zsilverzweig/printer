/**
 * Icon and Color Options for Funds
 * 
 * Provides preset icon and color options for fund customization.
 */

import {
  Wallet,
  TrendingUp,
  TrendingDown,
  BarChart3,
  PieChart,
  Target,
  Zap,
  Flame,
  Rocket,
  LineChart,
  Activity,
  DollarSign,
  Coins,
  Briefcase,
  LucideIcon,
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
  { name: "Wallet", icon: Wallet, label: "Wallet" },
  { name: "TrendingUp", icon: TrendingUp, label: "Trending Up" },
  { name: "TrendingDown", icon: TrendingDown, label: "Trending Down" },
  { name: "BarChart3", icon: BarChart3, label: "Bar Chart" },
  { name: "PieChart", icon: PieChart, label: "Pie Chart" },
  { name: "Target", icon: Target, label: "Target" },
  { name: "Zap", icon: Zap, label: "Zap" },
  { name: "Flame", icon: Flame, label: "Flame" },
  { name: "Rocket", icon: Rocket, label: "Rocket" },
  { name: "LineChart", icon: LineChart, label: "Line Chart" },
  { name: "Activity", icon: Activity, label: "Activity" },
  { name: "DollarSign", icon: DollarSign, label: "Dollar Sign" },
  { name: "Coins", icon: Coins, label: "Coins" },
  { name: "Briefcase", icon: Briefcase, label: "Briefcase" },
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

