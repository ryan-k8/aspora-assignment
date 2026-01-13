import ngeohash from 'ngeohash';
import { ILocation, IHourlyWeather } from '@/types';
import { IWeatherProvider } from '@/services/interfaces/weather.provider.interface';
import { ICache } from '@/utils/geohash-cache';

export class WeatherRepository {
  constructor(private cache: ICache<IHourlyWeather[]>) {}

  async getWeatherData(
    provider: IWeatherProvider,
    locations: ILocation[],
    start: Date,
    end: Date,
  ): Promise<IHourlyWeather[]> {
    const cacheKey = this.generateCacheKey(locations, start, end);
    let data = await this.cache.get(cacheKey);

    if (!data) {
      data = await provider.getWeatherData(locations, start, end);
      await this.cache.set(cacheKey, data, 10 * 60 * 1000); // 10 minutes TTL
    }

    return data;
  }

  private generateCacheKey(
    locations: ILocation[],
    start: Date,
    end: Date,
  ): string {
    const locationKeys = locations
      .map((loc) => ngeohash.encode(loc.latitude, loc.longitude, 5))
      .sort()
      .join('_');
    const dateKey =
      start.toISOString().split('T')[0] + '_' + end.toISOString().split('T')[0];
    return `${locationKeys}_${dateKey}`;
  }
}
