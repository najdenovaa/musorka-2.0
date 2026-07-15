import { ViewStyle, Platform } from 'react-native';

export const METALLIC_BORDER_COLOR = 'rgba(180,210,195,0.45)';
export const METALLIC_BORDER_COLOR_STRONG = 'rgba(200,225,210,0.55)';
export const METALLIC_SHADOW_COLOR = 'rgba(180,220,200,0.35)';
export const METALLIC_GLOW_COLOR = 'rgba(160,210,185,0.2)';
export const METALLIC_INNER_HIGHLIGHT = 'rgba(220,240,230,0.08)';

export const metallicBorder: ViewStyle = {
  borderWidth: 1.5,
  borderColor: METALLIC_BORDER_COLOR,
  ...(Platform.OS !== 'web'
    ? {
        shadowColor: METALLIC_SHADOW_COLOR,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.5,
        shadowRadius: 6,
        elevation: 3,
      }
    : {}),
};

export const metallicBorderStrong: ViewStyle = {
  borderWidth: 1.5,
  borderColor: METALLIC_BORDER_COLOR_STRONG,
  ...(Platform.OS !== 'web'
    ? {
        shadowColor: METALLIC_SHADOW_COLOR,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 8,
        elevation: 4,
      }
    : {}),
};

export const metallicBorderLight: ViewStyle = {
  borderWidth: 1,
  borderColor: 'rgba(170,200,185,0.3)',
  ...(Platform.OS !== 'web'
    ? {
        shadowColor: METALLIC_SHADOW_COLOR,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 2,
      }
    : {}),
};

export const metallicCard: ViewStyle = {
  ...metallicBorder,
  backgroundColor: 'rgba(15,42,26,0.95)',
};

export const metallicButton: ViewStyle = {
  ...metallicBorderStrong,
  backgroundColor: 'rgba(15,42,26,0.9)',
};

export const metallicInput: ViewStyle = {
  ...metallicBorder,
  backgroundColor: 'rgba(11,35,21,0.95)',
};
