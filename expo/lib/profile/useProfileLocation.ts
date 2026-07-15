import { useEffect, useState } from "react";

export interface LocationInfo {
  city: string;
  timezone: string;
  offset: string;
}

const DEFAULT_LOCATION: LocationInfo = {
  city: "",
  timezone: "Asia/Yekaterinburg",
  offset: "UTC+5" as const,
};

export function useProfileLocation() {
  const [locationInfo, setLocationInfo] = useState<LocationInfo | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);

  useEffect(() => {
    const fetchLocation = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const res = await fetch("https://ipapi.co/json/", { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as { utc_offset?: string; city?: string; timezone?: string };
        const utcOffset: string = data.utc_offset ?? "+0500";
        const offsetSign = utcOffset.startsWith("-") ? "-" : "+";
        const offsetHours = parseInt(utcOffset.replace(/[^0-9]/g, "").slice(0, 2), 10);
        const offsetStr = `UTC${offsetSign}${offsetHours}`;
        setLocationInfo({
          city: data.city ?? DEFAULT_LOCATION.city,
          timezone: data.timezone ?? DEFAULT_LOCATION.timezone,
          offset: offsetStr,
        });
        console.log("[Profile] Location loaded:", data.city, data.timezone);
      } catch (err) {
        console.log("[Profile] Location fetch skipped, using default:", err);
        setLocationInfo({ ...DEFAULT_LOCATION });
      } finally {
        setLocationLoading(false);
      }
    };
    void fetchLocation();
  }, []);

  return { locationInfo, locationLoading };
}
