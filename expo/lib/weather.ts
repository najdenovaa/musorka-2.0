import { useEffect, useState, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface WeatherData {
  temperature: number;
  emoji: string;
  description: string;
  cityName: string;
}

interface OpenMeteoResponse {
  current_weather?: {
    temperature: number;
    weathercode: number;
  };
}

interface GeocodingResult {
  results?: Array<{
    latitude: number;
    longitude: number;
    name: string;
  }>;
}

const CITY_COORDS: Record<string, { lat: number; lon: number }> = {
  'тюмень': { lat: 57.15, lon: 68.18 },
  'москва': { lat: 55.75, lon: 37.62 },
  'санкт-петербург': { lat: 59.93, lon: 30.32 },
  'екатеринбург': { lat: 56.84, lon: 60.60 },
  'новосибирск': { lat: 55.03, lon: 82.92 },
  'казань': { lat: 55.79, lon: 49.11 },
  'нижний новгород': { lat: 56.30, lon: 44.00 },
  'челябинск': { lat: 55.16, lon: 61.40 },
  'омск': { lat: 54.99, lon: 73.37 },
  'самара': { lat: 53.20, lon: 50.15 },
  'ростов-на-дону': { lat: 47.23, lon: 39.72 },
  'уфа': { lat: 54.74, lon: 55.97 },
  'красноярск': { lat: 56.01, lon: 92.87 },
  'пермь': { lat: 58.01, lon: 56.25 },
  'воронеж': { lat: 51.67, lon: 39.18 },
  'волгоград': { lat: 48.71, lon: 44.51 },
  'краснодар': { lat: 45.04, lon: 38.98 },
  'сургут': { lat: 61.25, lon: 73.38 },
  'тобольск': { lat: 58.20, lon: 68.25 },
  'барнаул': { lat: 53.35, lon: 83.77 },
  'владивосток': { lat: 43.12, lon: 131.89 },
  'хабаровск': { lat: 48.48, lon: 135.08 },
  'иркутск': { lat: 52.29, lon: 104.28 },
  'кемерово': { lat: 55.35, lon: 86.09 },
  'томск': { lat: 56.50, lon: 84.97 },
  'саратов': { lat: 51.53, lon: 46.00 },
  'тула': { lat: 54.19, lon: 37.62 },
  'рязань': { lat: 54.63, lon: 39.69 },
  'пенза': { lat: 53.19, lon: 45.02 },
  'оренбург': { lat: 51.77, lon: 55.10 },
  'ижевск': { lat: 56.85, lon: 53.20 },
  'ульяновск': { lat: 54.31, lon: 48.36 },
  'ярославль': { lat: 57.63, lon: 39.87 },
  'тверь': { lat: 56.86, lon: 35.92 },
  'калининград': { lat: 54.71, lon: 20.51 },
  'мурманск': { lat: 68.97, lon: 33.08 },
  'архангельск': { lat: 64.54, lon: 40.54 },
  'сочи': { lat: 43.60, lon: 39.73 },
  'махачкала': { lat: 42.97, lon: 47.50 },
  'грозный': { lat: 43.32, lon: 45.69 },
  'ставрополь': { lat: 45.04, lon: 41.97 },
  'астрахань': { lat: 46.35, lon: 48.04 },
  'белгород': { lat: 50.60, lon: 36.59 },
  'брянск': { lat: 53.25, lon: 34.37 },
  'владимир': { lat: 56.13, lon: 40.41 },
  'вологда': { lat: 59.22, lon: 39.88 },
  'иваново': { lat: 56.99, lon: 40.97 },
  'калуга': { lat: 54.53, lon: 36.27 },
  'кострома': { lat: 57.77, lon: 40.93 },
  'курган': { lat: 55.45, lon: 65.35 },
  'курск': { lat: 51.73, lon: 36.19 },
  'липецк': { lat: 52.61, lon: 39.59 },
  'нальчик': { lat: 43.49, lon: 43.62 },
  'орёл': { lat: 52.97, lon: 36.06 },
  'псков': { lat: 57.82, lon: 28.33 },
  'смоленск': { lat: 54.78, lon: 32.04 },
  'тамбов': { lat: 52.73, lon: 41.44 },
  'чебоксары': { lat: 56.13, lon: 47.25 },
  'магнитогорск': { lat: 53.39, lon: 59.04 },
  'набережные челны': { lat: 55.74, lon: 52.40 },
  'нижнекамск': { lat: 55.64, lon: 51.82 },
  'нижний тагил': { lat: 57.92, lon: 59.97 },
  'тольятти': { lat: 53.53, lon: 49.35 },
  'таганрог': { lat: 47.24, lon: 38.90 },
  'новороссийск': { lat: 44.72, lon: 37.77 },
  'сыктывкар': { lat: 61.67, lon: 50.84 },
  'якутск': { lat: 62.03, lon: 129.73 },
  'петрозаводск': { lat: 61.79, lon: 34.36 },
  'симферополь': { lat: 44.95, lon: 34.10 },
  'севастополь': { lat: 44.62, lon: 33.52 },
  'новый уренгой': { lat: 66.08, lon: 76.68 },
  'ноябрьск': { lat: 63.20, lon: 75.45 },
  'нижневартовск': { lat: 60.93, lon: 76.57 },
  'нефтеюганск': { lat: 61.10, lon: 72.60 },
  'ханты-мансийск': { lat: 61.00, lon: 69.00 },
  'салехард': { lat: 66.53, lon: 66.60 },
  'благовещенск': { lat: 50.29, lon: 127.54 },
  'петропавловск-камчатский': { lat: 53.04, lon: 158.65 },
  'южно-сахалинск': { lat: 46.96, lon: 142.74 },
  'магадан': { lat: 59.57, lon: 150.80 },
  'анадырь': { lat: 64.73, lon: 177.51 },
  'биробиджан': { lat: 48.79, lon: 132.92 },
  'абакан': { lat: 53.72, lon: 91.44 },
  'кызыл': { lat: 51.72, lon: 94.45 },
  'горно-алтайск': { lat: 51.96, lon: 85.96 },
  'чита': { lat: 52.03, lon: 113.50 },
  'улан-удэ': { lat: 51.83, lon: 107.59 },
  'элиста': { lat: 46.31, lon: 44.27 },
  'майкоп': { lat: 44.61, lon: 40.10 },
  'черкесск': { lat: 44.22, lon: 42.06 },
  'владикавказ': { lat: 43.02, lon: 44.68 },
  'саранск': { lat: 54.19, lon: 45.18 },
  'йошкар-ола': { lat: 56.63, lon: 47.87 },
};

const geocodingCache: Record<string, { lat: number; lon: number }> = {};

function getWeatherEmoji(code: number): { emoji: string; description: string } {
  if (code === 0) return { emoji: '☀️', description: 'Ясно' };
  if (code === 1) return { emoji: '🌤', description: 'Малооблачно' };
  if (code === 2) return { emoji: '⛅', description: 'Переменная облачность' };
  if (code === 3) return { emoji: '☁️', description: 'Пасмурно' };
  if (code === 45 || code === 48) return { emoji: '🌫️', description: 'Туман' };
  if (code >= 51 && code <= 57) return { emoji: '🌦', description: 'Морось' };
  if (code >= 61 && code <= 65) return { emoji: '🌧️', description: 'Дождь' };
  if (code === 66 || code === 67) return { emoji: '🌧️', description: 'Ледяной дождь' };
  if (code >= 71 && code <= 77) return { emoji: '❄️', description: 'Снег' };
  if (code >= 80 && code <= 82) return { emoji: '🌧️', description: 'Ливень' };
  if (code === 85 || code === 86) return { emoji: '🌨️', description: 'Снегопад' };
  if (code === 95) return { emoji: '⛈️', description: 'Гроза' };
  if (code === 96 || code === 99) return { emoji: '⛈️', description: 'Гроза с градом' };
  return { emoji: '🌤', description: 'Облачно' };
}

function getCoordsForCity(city: string): { lat: number; lon: number } | null {
  const normalized = city.toLowerCase().trim();
  if (geocodingCache[normalized]) {
    return geocodingCache[normalized];
  }
  for (const [key, coords] of Object.entries(CITY_COORDS)) {
    if (normalized === key || normalized.includes(key) || key.includes(normalized)) {
      return coords;
    }
  }
  return null;
}

async function geocodeCity(city: string): Promise<{ lat: number; lon: number } | null> {
  const normalized = city.toLowerCase().trim();
  if (geocodingCache[normalized]) return geocodingCache[normalized];

  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=ru&format=json`;
    const res = await fetch(url);
    const data: GeocodingResult = await res.json();
    if (data.results && data.results.length > 0) {
      const result = { lat: data.results[0].latitude, lon: data.results[0].longitude };
      geocodingCache[normalized] = result;
      console.log('[Weather] Geocoded city:', city, '→', result.lat, result.lon);
      return result;
    }
  } catch (err) {
    console.log('[Weather] Geocoding error for:', city, err);
  }
  return null;
}

function makePrepositional(city: string): string {
  const KNOWN: Record<string, string> = {
    'тюмень': 'Тюмени',
    'москва': 'Москве',
    'санкт-петербург': 'Санкт-Петербурге',
    'екатеринбург': 'Екатеринбурге',
    'новосибирск': 'Новосибирске',
    'казань': 'Казани',
    'нижний новгород': 'Нижнем Новгороде',
    'челябинск': 'Челябинске',
    'омск': 'Омске',
    'самара': 'Самаре',
    'ростов-на-дону': 'Ростове-на-Дону',
    'уфа': 'Уфе',
    'красноярск': 'Красноярске',
    'пермь': 'Перми',
    'воронеж': 'Воронеже',
    'волгоград': 'Волгограде',
    'краснодар': 'Краснодаре',
    'сургут': 'Сургуте',
    'тобольск': 'Тобольске',
    'сочи': 'Сочи',
    'севастополь': 'Севастополе',
    'симферополь': 'Симферополе',
    'калининград': 'Калининграде',
    'мурманск': 'Мурманске',
    'архангельск': 'Архангельске',
    'ставрополь': 'Ставрополе',
    'астрахань': 'Астрахани',
    'ярославль': 'Ярославле',
    'тверь': 'Твери',
    'владивосток': 'Владивостоке',
    'хабаровск': 'Хабаровске',
    'иркутск': 'Иркутске',
    'барнаул': 'Барнауле',
    'томск': 'Томске',
    'кемерово': 'Кемерово',
    'саратов': 'Саратове',
    'белгород': 'Белгороде',
    'курск': 'Курске',
    'тула': 'Туле',
    'рязань': 'Рязани',
    'пенза': 'Пензе',
    'оренбург': 'Оренбурге',
    'магнитогорск': 'Магнитогорске',
    'тольятти': 'Тольятти',
    'нижний тагил': 'Нижнем Тагиле',
    'набережные челны': 'Набережных Челнах',
    'якутск': 'Якутске',
    'петрозаводск': 'Петрозаводске',
  };
  const normalized = city.toLowerCase().trim();
  for (const [key, prep] of Object.entries(KNOWN)) {
    if (normalized === key || normalized.includes(key) || key.includes(normalized)) {
      return prep;
    }
  }
  const last = city.trim();
  if (last.endsWith('ь')) return last.slice(0, -1) + 'и';
  if (last.endsWith('а')) return last.slice(0, -1) + 'е';
  if (last.endsWith('о')) return last;
  if (last.endsWith('ск') || last.endsWith('рг') || last.endsWith('нс') || last.endsWith('ов') || last.endsWith('ев') || last.endsWith('ин')) return last + 'е';
  return last + 'е';
}

function getWeatherAdjective(description: string): string {
  const lower = description.toLowerCase();
  if (lower.includes('ясно') || lower.includes('малооблачно')) return 'солнечная';
  if (lower.includes('пасмурно') || lower.includes('облачн')) return 'пасмурная';
  if (lower.includes('туман')) return 'туманная';
  if (lower.includes('морось') || lower.includes('дождь') || lower.includes('ливень') || lower.includes('ледяной')) return 'дождливая';
  if (lower.includes('снег') || lower.includes('снегопад')) return 'снежная';
  if (lower.includes('гроза')) return 'грозовая';
  return 'переменная';
}

function getWeatherTip(description: string, temperature: number): string {
  const lower = description.toLowerCase();
  if (lower.includes('ясно') || lower.includes('малооблачно')) {
    if (temperature > 25) return 'не забудьте солнечные очки и воду! 😎';
    if (temperature > 15) return 'не забудьте солнечные очки! 😎';
    if (temperature > 0) return 'солнце обманчиво — оденьтесь потеплее! 🧥';
    return 'солнце есть, а тепла нет — укутайтесь! 🧣';
  }
  if (lower.includes('пасмурно') || lower.includes('облачн')) {
    if (temperature < 0) return 'серо и морозно — горячий чай вам в помощь! ☕';
    return 'тучки нависли, но настроение не портим! 💪';
  }
  if (lower.includes('туман')) {
    return 'будьте внимательнее на дорогах! 🚗';
  }
  if (lower.includes('морось')) {
    return 'зонтик не помешает, хотя можно и так! 🌂';
  }
  if (lower.includes('дождь') || lower.includes('ливень') || lower.includes('ледяной')) {
    return 'берите зонт и резиновые сапоги! ☔';
  }
  if (lower.includes('снег') || lower.includes('снегопад')) {
    if (temperature < -15) return 'мороз крепчает — одевайтесь как капуста! 🥶';
    return 'снежок идёт — шапку не забудьте! ❄️';
  }
  if (lower.includes('гроза')) {
    return 'лучше переждать дома с чашкой какао! ⚡';
  }
  if (temperature < -20) return 'на улице дубак — оденьтесь потеплее! 🥶';
  if (temperature < 0) return 'подморозило — не забудьте тёплую куртку! 🧤';
  return 'погода переменчива — будьте готовы ко всему! 🌈';
}

export { getWeatherAdjective, getWeatherTip };

let cachedWeather: { data: WeatherData; city: string; fetchedAt: number } | null = null;
const CACHE_TTL = 30 * 60 * 1000;
const WEATHER_STORAGE_KEY = 'weather_cache_v1';

let _weatherDiskLoaded = false;

function loadWeatherFromDisk() {
  if (_weatherDiskLoaded) return;
  _weatherDiskLoaded = true;
  void AsyncStorage.getItem(WEATHER_STORAGE_KEY).then((raw) => {
    if (!raw || cachedWeather) return;
    try {
      const parsed = JSON.parse(raw) as { data: WeatherData; city: string; fetchedAt: number };
      if (parsed && parsed.data && Date.now() - parsed.fetchedAt < CACHE_TTL) {
        cachedWeather = parsed;
        console.log('[Weather] Restored from disk cache:', parsed.city);
      }
    } catch { /* ignore */ }
  }).catch(() => {});
}

loadWeatherFromDisk();

function saveWeatherToDisk(cache: { data: WeatherData; city: string; fetchedAt: number }) {
  void AsyncStorage.setItem(WEATHER_STORAGE_KEY, JSON.stringify(cache)).catch(() => {});
}

export function useWeather(city?: string, address?: string): WeatherData | null {
  const [weather, setWeather] = useState<WeatherData | null>(() => {
    if (cachedWeather && Date.now() - cachedWeather.fetchedAt < CACHE_TTL) {
      const resolvedCity = city || '';
      if (resolvedCity && (resolvedCity.toLowerCase().includes(cachedWeather.city) || cachedWeather.city.includes(resolvedCity.toLowerCase()))) {
        return cachedWeather.data;
      }
    }
    return null;
  });
  const fetchedRef = useRef<string>('');

  useEffect(() => {
    const resolvedCity = city || '';
    if (!resolvedCity) return;

    const cityKey = resolvedCity.toLowerCase().trim();
    if (fetchedRef.current === cityKey) return;

    if (cachedWeather && Date.now() - cachedWeather.fetchedAt < CACHE_TTL) {
      if (cityKey === cachedWeather.city || cityKey.includes(cachedWeather.city) || cachedWeather.city.includes(cityKey)) {
        setWeather(cachedWeather.data);
        fetchedRef.current = cityKey;
        return;
      }
    }

    const coords = getCoordsForCity(resolvedCity);
    const displayCity = makePrepositional(resolvedCity);
    if (coords) {
      fetchWeather(coords.lat, coords.lon, cityKey, displayCity);
    } else {
      fetchedRef.current = cityKey;
      geocodeCity(resolvedCity).then((geoCoords) => {
        if (geoCoords) {
          fetchWeather(geoCoords.lat, geoCoords.lon, cityKey, displayCity);
        } else {
          console.log('[Weather] Could not geocode city:', resolvedCity);
        }
      }).catch(() => {
        console.log('[Weather] Geocoding failed for:', resolvedCity);
      });
    }
  }, [city, address]);

  function fetchWeather(lat: number, lon: number, cityKey: string, resolvedDisplayCity: string) {
    fetchedRef.current = cityKey;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&timezone=auto`;

    fetch(url)
      .then((res) => res.json())
      .then((data: OpenMeteoResponse) => {
        if (data.current_weather) {
          const { temperature, weathercode } = data.current_weather;
          const { emoji, description } = getWeatherEmoji(weathercode);
          const result: WeatherData = {
            temperature: Math.round(temperature),
            emoji,
            description,
            cityName: resolvedDisplayCity,
          };
          const cacheEntry = { data: result, city: cityKey, fetchedAt: Date.now() };
          cachedWeather = cacheEntry;
          saveWeatherToDisk(cacheEntry);
          setWeather(result);
          console.log('[Weather] Fetched:', cityKey, temperature + '°C', description);
        }
      })
      .catch((err) => {
        console.log('[Weather] Fetch error:', err);
      });
  }

  return weather;
}
