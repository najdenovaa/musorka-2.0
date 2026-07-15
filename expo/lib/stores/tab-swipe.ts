import { create } from "zustand";

interface TabSwipeState {
  disabled: boolean;
  setDisabled: (v: boolean) => void;
}

/**
 * Centralized lock for the global tab-swipe gesture in app/(tabs)/_layout.tsx.
 * Screens that need to handle horizontal gestures (e.g. Live feed carousel)
 * call setDisabled(true) on focus and setDisabled(false) on blur.
 */
export const useTabSwipeStore = create<TabSwipeState>((set) => ({
  disabled: false,
  setDisabled: (v: boolean) => set({ disabled: v }),
}));
