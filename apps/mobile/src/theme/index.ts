export const theme = {
  colors: {
    night: '#0B1014',
    deepSea: '#0F1F2D',
    sand: '#F5EFE6',
    clay: '#CBBBA0',
    coral: '#FF6B4A',
    mint: '#2EC4B6',
    ember: '#F4A261',
    white: '#FFFFFF',
    ink: '#131A22',
  },
  spacing: {
    xs: 6,
    sm: 10,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 40,
  },
  radius: {
    sm: 10,
    md: 16,
    lg: 24,
  },
  typography: {
    heading: {
      fontFamily: 'SpaceGrotesk_700Bold',
      letterSpacing: 0.3,
    },
    subheading: {
      fontFamily: 'SpaceGrotesk_600SemiBold',
      letterSpacing: 0.2,
    },
    body: {
      fontFamily: 'SpaceGrotesk_400Regular',
      letterSpacing: 0.1,
    },
    button: {
      fontFamily: 'SpaceGrotesk_600SemiBold',
      letterSpacing: 0.2,
    },
    mono: {
      fontFamily: 'SpaceGrotesk_500Medium',
      letterSpacing: 0.4,
    },
  },
} as const;
