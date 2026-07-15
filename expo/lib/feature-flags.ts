// Единственный источник истины для клиентских фича-флагов.
// По умолчанию Live включён (для отключения нужно явно выставить 'false').
const raw = process.env.EXPO_PUBLIC_LIVE_ENABLED;
export const LIVE_ENABLED: boolean = raw !== 'false';
