import { RUSSIAN_REGIONS, findRegionByCity } from '@/constants/russian-regions';

type TzInfo = { offsetMinutes: number; abbr: string };

const REGION_TZ_INFO: Record<string, TzInfo> = {
  kaliningrad: { offsetMinutes: 2 * 60, abbr: 'MSK-1' },

  samara: { offsetMinutes: 4 * 60, abbr: 'MSK+1' },
  udmurtia: { offsetMinutes: 4 * 60, abbr: 'MSK+1' },
  astrakhan: { offsetMinutes: 4 * 60, abbr: 'MSK+1' },
  saratov: { offsetMinutes: 4 * 60, abbr: 'MSK+1' },
  ulyanovsk: { offsetMinutes: 4 * 60, abbr: 'MSK+1' },

  bashkortostan: { offsetMinutes: 5 * 60, abbr: 'MSK+2' },
  perm: { offsetMinutes: 5 * 60, abbr: 'MSK+2' },
  sverdlovsk: { offsetMinutes: 5 * 60, abbr: 'MSK+2' },
  chelyabinsk: { offsetMinutes: 5 * 60, abbr: 'MSK+2' },
  tyumen: { offsetMinutes: 5 * 60, abbr: 'MSK+2' },
  hmao: { offsetMinutes: 5 * 60, abbr: 'MSK+2' },
  yanao: { offsetMinutes: 5 * 60, abbr: 'MSK+2' },
  kurgan: { offsetMinutes: 5 * 60, abbr: 'MSK+2' },
  orenburg: { offsetMinutes: 5 * 60, abbr: 'MSK+2' },

  omsk: { offsetMinutes: 6 * 60, abbr: 'MSK+3' },

  altai_krai: { offsetMinutes: 7 * 60, abbr: 'MSK+4' },
  altai_republic: { offsetMinutes: 7 * 60, abbr: 'MSK+4' },
  novosibirsk: { offsetMinutes: 7 * 60, abbr: 'MSK+4' },
  tomsk: { offsetMinutes: 7 * 60, abbr: 'MSK+4' },
  kemerovo: { offsetMinutes: 7 * 60, abbr: 'MSK+4' },
  krasnoyarsk: { offsetMinutes: 7 * 60, abbr: 'MSK+4' },
  khakassia: { offsetMinutes: 7 * 60, abbr: 'MSK+4' },
  tuva: { offsetMinutes: 7 * 60, abbr: 'MSK+4' },

  irkutsk: { offsetMinutes: 8 * 60, abbr: 'MSK+5' },
  buryatia: { offsetMinutes: 8 * 60, abbr: 'MSK+5' },

  zabaykalsky: { offsetMinutes: 9 * 60, abbr: 'MSK+6' },
  sakha: { offsetMinutes: 9 * 60, abbr: 'MSK+6' },
  amur: { offsetMinutes: 9 * 60, abbr: 'MSK+6' },

  primorsky: { offsetMinutes: 10 * 60, abbr: 'MSK+7' },
  khabarovsk: { offsetMinutes: 10 * 60, abbr: 'MSK+7' },
  eao: { offsetMinutes: 10 * 60, abbr: 'MSK+7' },

  magadan: { offsetMinutes: 11 * 60, abbr: 'MSK+8' },
  sakhalin: { offsetMinutes: 11 * 60, abbr: 'MSK+8' },

  kamchatka: { offsetMinutes: 12 * 60, abbr: 'MSK+9' },
  chukotka: { offsetMinutes: 12 * 60, abbr: 'MSK+9' },
};

const DEFAULT_TZ: TzInfo = { offsetMinutes: 3 * 60, abbr: 'MSK' };

function getTzInfoByRegionName(regionName: string | null | undefined): TzInfo {
  if (!regionName) return DEFAULT_TZ;
  const region = RUSSIAN_REGIONS.find((r) => r.name === regionName);
  if (!region) return DEFAULT_TZ;
  return REGION_TZ_INFO[region.id] ?? DEFAULT_TZ;
}

function getTzInfoByCity(cityName: string | null | undefined): TzInfo {
  if (!cityName) return DEFAULT_TZ;
  const regionName = findRegionByCity(cityName);
  return getTzInfoByRegionName(regionName);
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function formatCreatedAtInCityTz(
  isoDate: string | null | undefined,
  cityName: string | null | undefined,
): string {
  if (!isoDate) return '';
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';
  const tz = getTzInfoByCity(cityName);
  const shifted = new Date(date.getTime() + tz.offsetMinutes * 60_000);
  const day = pad2(shifted.getUTCDate());
  const month = pad2(shifted.getUTCMonth() + 1);
  const year = shifted.getUTCFullYear();
  const hour = pad2(shifted.getUTCHours());
  const minute = pad2(shifted.getUTCMinutes());
  return `${day}.${month}.${year}, ${hour}:${minute}`;
}

export function getTimezoneAbbr(cityName: string | null | undefined): string {
  return getTzInfoByCity(cityName).abbr;
}
