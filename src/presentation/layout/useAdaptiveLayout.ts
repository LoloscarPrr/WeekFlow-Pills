import { useWindowDimensions } from 'react-native';

export type AdaptiveLayoutClass = 'compact' | 'regular' | 'wide';

export function useAdaptiveLayout() {
  const { width, height } = useWindowDimensions();
  const layoutClass: AdaptiveLayoutClass = width <= 359 ? 'compact' : width >= 840 ? 'wide' : 'regular';

  return {
    width,
    height,
    layoutClass,
    isCompact: layoutClass === 'compact',
    isWide: layoutClass === 'wide',
    stageMaxWidth: 760,
  } as const;
}
