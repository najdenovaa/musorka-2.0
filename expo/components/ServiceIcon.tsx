import React from 'react';
import {
  Trash2,
  HardHat,
  Sparkles,
  Hammer,
  Users,
  Truck,
  Home,
  Recycle,
  Wrench,
  Droplets,
  Zap,
  Armchair,
  Monitor,
  KeyRound,
  Bike,
  Heart,
  Laptop,
  Package,
} from 'lucide-react-native';

const iconMap: Record<string, React.ComponentType<{ size: number; color: string }>> = {
  Trash2,
  HardHat,
  Sparkles,
  Hammer,
  Users,
  Truck,
  Home,
  Recycle,
  Wrench,
  Droplets,
  Zap,
  Armchair,
  Monitor,
  KeyRound,
  Bike,
  Heart,
  Laptop,
  Package,
};

/** Icon names available for admin-created service categories. */
export const SERVICE_ICON_NAMES: string[] = Object.keys(iconMap);

interface ServiceIconProps {
  name: string;
  size: number;
  color: string;
}

export default React.memo(function ServiceIcon({ name, size, color }: ServiceIconProps) {
  const IconComponent = iconMap[name] || Wrench;
  return <IconComponent size={size} color={color} />;
});
