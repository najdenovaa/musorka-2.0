import { Platform, type FlatListProps } from "react-native";

const IS_ANDROID = Platform.OS === 'android';

/** Tuned defaults for long lists (requests, chat). Android uses smaller windows to keep memory low. */
export const DEFAULT_LIST_PERFORMANCE: Pick<
  FlatListProps<unknown>,
  | "initialNumToRender"
  | "maxToRenderPerBatch"
  | "windowSize"
  | "updateCellsBatchingPeriod"
  | "removeClippedSubviews"
> = {
  initialNumToRender: IS_ANDROID ? 6 : 12,
  maxToRenderPerBatch: IS_ANDROID ? 4 : 8,
  windowSize: IS_ANDROID ? 5 : 8,
  updateCellsBatchingPeriod: IS_ANDROID ? 80 : 50,
  // false: true caused native crashes / lost touches with nested Touchables (RequestCard) in tabs.
  removeClippedSubviews: false,
};
