import { useEffect, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";

/**
 * Returns `activeMs` while app is foregrounded, `false` when backgrounded — reduces polling load.
 */
export function useAppStateRefetchInterval(activeMs: number): number | false {
  const [interval, setInterval] = useState<number | false>(() =>
    AppState.currentState === "active" ? activeMs : false,
  );

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      setInterval(next === "active" ? activeMs : false);
    });
    return () => sub.remove();
  }, [activeMs]);

  return interval;
}
