import { fetchWeatherApi } from 'openmeteo';
import { ILocation, IHourlyWeather } from '@/types';
import { IWeatherProvider } from '@/services/interfaces/weather.provider.interface';

// Timeout wrapper for API calls
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('API request timed out')), timeoutMs),
    ),
  ]);
}

export class OpenMeteoProvider implements IWeatherProvider {
  async getWeatherData(
    locations: ILocation[],
    startDate: Date,
    endDate: Date,
  ): Promise<IHourlyWeather[]> {
    const lats = locations.map((l) => l.latitude);
    const lons = locations.map((l) => l.longitude);

    // Fetch weather data
    const weatherParams = {
      latitude: lats,
      longitude: lons,
      start_date: startDate.toISOString().split('T')[0],
      end_date: endDate.toISOString().split('T')[0],
      hourly:
        'temperature_2m,precipitation_probability,wind_speed_10m,visibility',
      timezone: 'GMT',
    };
    const weatherUrl = 'https://api.open-meteo.com/v1/forecast';
    const weatherResponses = await withTimeout(
      fetchWeatherApi(weatherUrl, weatherParams),
      5000,
    );

    // Fetch air quality data
    const aqiParams = {
      latitude: lats,
      longitude: lons,
      start_date: startDate.toISOString().split('T')[0],
      end_date: endDate.toISOString().split('T')[0],
      hourly: 'european_aqi',
      timezone: 'GMT',
    };
    const aqiUrl = 'https://air-quality-api.open-meteo.com/v1/air-quality';
    const aqiResponses = await withTimeout(
      fetchWeatherApi(aqiUrl, aqiParams),
      5000,
    );

    const results: IHourlyWeather[] = [];

    for (let i = 0; i < locations.length; i++) {
      const weatherResponse = weatherResponses[i];
      const aqiResponse = aqiResponses[i];

      const utcOffsetSeconds = weatherResponse.utcOffsetSeconds();
      const weatherHourly = weatherResponse.hourly()!;
      const aqiHourly = aqiResponse.hourly()!;

      // Helper function to form time ranges
      const range = (start: number, stop: number, step: number) =>
        Array.from(
          { length: (stop - start) / step },
          (_, i) => start + i * step,
        );

      const time = range(
        Number(weatherHourly.time()),
        Number(weatherHourly.timeEnd()),
        weatherHourly.interval(),
      ).map((t) => new Date((t + utcOffsetSeconds) * 1000));

      const temperature = weatherHourly.variables(0)!.valuesArray()!;
      const precipitationProbability = weatherHourly
        .variables(1)!
        .valuesArray()!;
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
}
