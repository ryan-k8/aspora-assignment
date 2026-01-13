import { fetchWeatherApi } from 'openmeteo';
import ngeohash from 'ngeohash';
import { ILocation, IHourlyWeather } from './types';

const cache = new Map<string, { weather: any; aqi: any; timestamp: number }>();

// Timeout wrapper for API calls
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('API request timed out')), timeoutMs),
    ),
  ]);
}

export async function getWeatherData(
  locations: ILocation[],
  startDate: Date,
  endDate: Date,
): Promise<IHourlyWeather[]> {
  const lats = locations.map((l) => l.latitude);
  const lons = locations.map((l) => l.longitude);

  const dateKey =
    startDate.toISOString().split('T')[0] +
    '_' +
    endDate.toISOString().split('T')[0];
  const cacheKeys = locations.map(
    (loc) => ngeohash.encode(loc.latitude, loc.longitude, 5) + '_' + dateKey,
  );

  const allCached = cacheKeys.every((key) => {
    const cached = cache.get(key);
    return cached && Date.now() - cached.timestamp < 10 * 60 * 1000;
  });

  let weatherResponses: any[] = new Array(locations.length);
  let aqiResponses: any[] = new Array(locations.length);
  const toFetchIndices: number[] = [];

  // Check cache for each location individually
  for (let i = 0; i < locations.length; i++) {
    const key = cacheKeys[i];
    const cached = cache.get(key);
    if (cached && Date.now() - cached.timestamp < 10 * 60 * 1000) {
      weatherResponses[i] = cached.weather;
      aqiResponses[i] = cached.aqi;
    } else {
      toFetchIndices.push(i);
    }
  }

  if (toFetchIndices.length > 0) {
    console.log(
      `Cache miss: fetching data for ${toFetchIndices.length} uncached locations`,
    );
    const toFetchLats = toFetchIndices.map((i) => lats[i]);
    const toFetchLons = toFetchIndices.map((i) => lons[i]);

    // Fetch weather data for uncached locations
    const weatherParams = {
      latitude: toFetchLats,
      longitude: toFetchLons,
      start_date: startDate.toISOString().split('T')[0],
      end_date: endDate.toISOString().split('T')[0],
      hourly:
        'temperature_2m,precipitation_probability,wind_speed_10m,visibility',
      timezone: 'GMT',
    };
    const weatherUrl = 'https://api.open-meteo.com/v1/forecast';
    const fetchedWeather = await withTimeout(
      fetchWeatherApi(weatherUrl, weatherParams),
      5000,
    );

    // Fetch air quality data for uncached locations
    const aqiParams = {
      latitude: toFetchLats,
      longitude: toFetchLons,
      start_date: startDate.toISOString().split('T')[0],
      end_date: endDate.toISOString().split('T')[0],
      hourly: 'european_aqi',
      timezone: 'GMT',
    };
    const aqiUrl = 'https://air-quality-api.open-meteo.com/v1/air-quality';
    const fetchedAqi = await withTimeout(
      fetchWeatherApi(aqiUrl, aqiParams),
      5000,
    );

    // Assign fetched data and cache
    for (let j = 0; j < toFetchIndices.length; j++) {
      const idx = toFetchIndices[j];
      weatherResponses[idx] = fetchedWeather[j];
      aqiResponses[idx] = fetchedAqi[j];
      cache.set(cacheKeys[idx], {
        weather: fetchedWeather[j],
        aqi: fetchedAqi[j],
        timestamp: Date.now(),
      });
    }
  } else {
    console.log('Cache hit: using cached data for all locations');
  }

  const results: IHourlyWeather[] = [];

  for (let i = 0; i < locations.length; i++) {
    const weatherResponse = weatherResponses[i];
    const aqiResponse = aqiResponses[i];

    const utcOffsetSeconds = weatherResponse.utcOffsetSeconds();
    const weatherHourly = weatherResponse.hourly()!;
    const aqiHourly = aqiResponse.hourly()!;

    // Helper function to form time ranges
    const range = (start: number, stop: number, step: number) =>
      Array.from({ length: (stop - start) / step }, (_, i) => start + i * step);

    const time = range(
      Number(weatherHourly.time()),
      Number(weatherHourly.timeEnd()),
      weatherHourly.interval(),
    ).map((t) => new Date((t + utcOffsetSeconds) * 1000));

    const temperature = weatherHourly.variables(0)!.valuesArray()!;
    const precipitationProbability = weatherHourly.variables(1)!.valuesArray()!;
    const windSpeed = weatherHourly.variables(2)!.valuesArray()!;
    const visibility = weatherHourly.variables(3)!.valuesArray()!;
    const aqi = aqiHourly.variables(0)!.valuesArray()!;

    results.push({
      time,
      temperature: Array.from(temperature),
      precipitationProbability: Array.from(precipitationProbability),
      windSpeed: Array.from(windSpeed),
      visibility: Array.from(visibility),
      aqi: Array.from(aqi),
    });
  }

  return results;
}
