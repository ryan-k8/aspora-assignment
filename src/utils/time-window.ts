import { IHourlyWeather } from '@/types';
import { IRiskValues } from '@/utils/risk-calculator';

// Function to get max values for a time window
export function getMaxForWindow(
  data: IHourlyWeather,
  start: Date,
  durationMin: number,
): IRiskValues {
  const end = new Date(start.getTime() + durationMin * 60 * 1000);
  const indices = data.time
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t >= start && t <= end)
    .map(({ i }) => i);
  if (indices.length === 0)
    return { temp: 0, precip: 0, wind: 0, vis: 10000, aqi: 0 }; // default safe
  const temps = indices.map((i) => data.temperature[i]);
  const precips = indices.map((i) => data.precipitationProbability[i]);
  const winds = indices.map((i) => data.windSpeed[i]);
  const viss = indices.map((i) => data.visibility[i]);
  const aqis = indices.map((i) => data.aqi[i]);
  return {
    temp: Math.max(...temps),
    precip: Math.max(...precips),
    wind: Math.max(...winds),
    vis: Math.min(...viss),
    aqi: Math.max(...aqis),
  };
}

// Get worst case across home and office
export function getWorstCase(
  homeData: IHourlyWeather,
  officeData: IHourlyWeather,
  start: Date,
  duration: number,
): IRiskValues {
  const homeMax = getMaxForWindow(homeData, start, duration);
  const officeMax = getMaxForWindow(officeData, start, duration);
  return {
    temp: Math.max(homeMax.temp, officeMax.temp),
    precip: Math.max(homeMax.precip, officeMax.precip),
    wind: Math.max(homeMax.wind, officeMax.wind),
    vis: Math.min(homeMax.vis, officeMax.vis),
    aqi: Math.max(homeMax.aqi, officeMax.aqi),
  };
}
