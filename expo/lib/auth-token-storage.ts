import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

/** Legacy key — token was stored here before SecureStore migration. */
export const LEGACY_AUTH_TOKEN_ASYNC_KEY = "musorka_auth_token";

const SECURE_AUTH_TOKEN_KEY = "musorka_auth_token_v2";

function isWeb(): boolean {
  return Platform.OS === "web";
}

/**
 * Load JWT: native prefers SecureStore, migrates from legacy AsyncStorage once.
 * Web uses AsyncStorage only (SecureStore is not suitable as primary there).
 */
export async function loadAuthToken(): Promise<string | null> {
  if (isWeb()) {
    return AsyncStorage.getItem(LEGACY_AUTH_TOKEN_ASYNC_KEY);
  }

  try {
    const secure = await SecureStore.getItemAsync(SECURE_AUTH_TOKEN_KEY);
    if (secure) return secure;
  } catch {
    /* ignore */
  }

  const legacy = await AsyncStorage.getItem(LEGACY_AUTH_TOKEN_ASYNC_KEY);
  if (legacy) {
    try {
      await SecureStore.setItemAsync(SECURE_AUTH_TOKEN_KEY, legacy);
    } catch {
      /* keep legacy in Async until next successful write */
    }
    await AsyncStorage.removeItem(LEGACY_AUTH_TOKEN_ASYNC_KEY);
  }
  return legacy;
}

export async function persistAuthToken(token: string | null): Promise<void> {
  if (isWeb()) {
    if (token) {
      await AsyncStorage.setItem(LEGACY_AUTH_TOKEN_ASYNC_KEY, token);
    } else {
      await AsyncStorage.removeItem(LEGACY_AUTH_TOKEN_ASYNC_KEY);
    }
    return;
  }

  if (token) {
    await SecureStore.setItemAsync(SECURE_AUTH_TOKEN_KEY, token);
    await AsyncStorage.removeItem(LEGACY_AUTH_TOKEN_ASYNC_KEY);
  } else {
    try {
      await SecureStore.deleteItemAsync(SECURE_AUTH_TOKEN_KEY);
    } catch {
      /* ignore */
    }
    await AsyncStorage.removeItem(LEGACY_AUTH_TOKEN_ASYNC_KEY);
  }
}
