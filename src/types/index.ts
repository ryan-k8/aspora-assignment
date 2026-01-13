export interface ILocation {
  latitude: number;
  longitude: number;
}

export interface ICommuteRequest {
  home: ILocation;
  office: ILocation;
  plannedDeparture: string; // ISO timestamp
  commuteDuration?: number; // in minutes, default 45
}

export interface IRiskComponent {
  score: number;
  value: string;
  severity: 'Low' | 'Medium' | 'High';
}

export interface IStructuredBreakdown {
  precipitationProbability: IRiskComponent;
  aqi: IRiskComponent;
  wind: IRiskComponent;
  visibility: IRiskComponent;
  temperature: IRiskComponent;
}

export interface ICommuteResponse {
  risk_score: number;
  recommendation: string;
  recommended_departure: string; // ISO timestamp
  risk_breakdown: IStructuredBreakdown;
  reason: string[];
}

export interface IWeatherData {
  time: Date;
  temperature: number;
  precipitationProbability: number;
  windSpeed: number;
  visibility: number;
  aqi: number;
}

export interface IHourlyWeather {
  time: Date[];
  temperature: number[];
  precipitationProbability: number[];
  windSpeed: number[];
  visibility: number[];
  aqi: number[];
}
