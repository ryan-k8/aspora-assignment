import { ILocation, IHourlyWeather } from '@/types';

export interface IWeatherProvider {
  getWeatherData(
    locations: ILocation[],
    start: Date,
    end: Date,
  ): Promise<IHourlyWeather[]>;
}
