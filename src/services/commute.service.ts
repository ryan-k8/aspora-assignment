import {
  ICommuteRequest,
  ICommuteResponse,
  IStructuredBreakdown,
} from '@/types';
import { IWeatherProvider } from '@/services/interfaces/weather.provider.interface';
import { IRecommendationStrategy } from '@/services/interfaces/recommendation.strategy.interface';
import { WeatherRepository } from '@/repositories/weather.repository';
import {
  computeSubScores,
  getSeverity,
  generateStaticReasons,
} from '../utils/risk-calculator';
import { getWorstCase } from '../utils/time-window';

const EARLY_OFFSET_MIN = 20;
const LATE_OFFSET_MIN = 20;

export class CommuteService {
  constructor(
    private weatherProvider: IWeatherProvider,
    private recommendationStrategy: IRecommendationStrategy,
    private weatherRepository: WeatherRepository,
  ) {}

  async getCommuteAdvice(request: ICommuteRequest): Promise<ICommuteResponse> {
    const { home, office, plannedDeparture, commuteDuration = 45 } = request;

    const plannedTime =
      plannedDeparture === 'leave now'
        ? new Date()
        : new Date(plannedDeparture);
    const startDate = new Date(plannedTime.getTime() - 60 * 60 * 1000); // 1 hour before
    const endDate = new Date(plannedTime.getTime() + 4 * 60 * 60 * 1000); // 4 hours after

    const locations = [home, office];
    const weatherData = await this.weatherRepository.getWeatherData(
      this.weatherProvider,
      locations,
      startDate,
      endDate,
    );

    // Log the fetched weather data for debugging
    console.log(
      `Fetched weather data from ${startDate.toISOString()} to ${endDate.toISOString()}`,
    );
    console.log('Home location weather summary:', {
      avgTemp:
        weatherData[0].temperature.reduce((a: number, b: number) => a + b, 0) /
        weatherData[0].temperature.length,
      maxPrecipProb: Math.max(...weatherData[0].precipitationProbability),
      maxWind: Math.max(...weatherData[0].windSpeed),
      minVis: Math.min(...weatherData[0].visibility),
      maxAQI: Math.max(...weatherData[0].aqi),
    });
    console.log('Office location weather summary:', {
      avgTemp:
        weatherData[1].temperature.reduce((a: number, b: number) => a + b, 0) /
        weatherData[1].temperature.length,
      maxPrecipProb: Math.max(...weatherData[1].precipitationProbability),
      maxWind: Math.max(...weatherData[1].windSpeed),
      minVis: Math.min(...weatherData[1].visibility),
      maxAQI: Math.max(...weatherData[1].aqi),
    });

    // Compute for planned
    const plannedWorst = getWorstCase(
      weatherData[0],
      weatherData[1],
      plannedTime,
      commuteDuration,
    );
    const plannedScores = computeSubScores(plannedWorst);

    // Early: 20 min earlier
    const earlyTime = new Date(
      plannedTime.getTime() - EARLY_OFFSET_MIN * 60 * 1000,
    );
    const earlyWorst = getWorstCase(
      weatherData[0],
      weatherData[1],
      earlyTime,
      commuteDuration,
    );
    let earlyScores = computeSubScores(earlyWorst);

    // Late: 20 min later
    const lateTime = new Date(
      plannedTime.getTime() + LATE_OFFSET_MIN * 60 * 1000,
    );
    const lateWorst = getWorstCase(
      weatherData[0],
      weatherData[1],
      lateTime,
      commuteDuration,
    );
    let lateScores = computeSubScores(lateWorst);

    // Handle past windows (e.g., for "leave now")
    const now = new Date();
    if (earlyTime < now) {
      earlyScores = plannedScores; // Use planned scores if early is in past
    }
    if (lateTime < now) {
      lateScores = plannedScores;
    }

    // Generate recommendation
    const recommendationResult =
      this.recommendationStrategy.generateRecommendation(
        plannedScores,
        earlyScores,
        lateScores,
        plannedDeparture,
        earlyTime,
        lateTime,
      );

    // Add static reasons
    const staticReasons = generateStaticReasons(plannedScores, plannedWorst);
    const reasons = [...recommendationResult.reasons, ...staticReasons];

    // Breakdown
    const breakdown: IStructuredBreakdown = {
      precipitationProbability: {
        score: plannedScores.precipScore,
        value: `${plannedWorst.precip.toFixed(0)}%`,
        severity: getSeverity(plannedScores.precipScore),
      },
      aqi: {
        score: plannedScores.aqiScore,
        value: plannedWorst.aqi.toFixed(0),
        severity: getSeverity(plannedScores.aqiScore),
      },
      wind: {
        score: plannedScores.windScore,
        value: `${plannedWorst.wind.toFixed(1)} km/h`,
        severity: getSeverity(plannedScores.windScore),
      },
      visibility: {
        score: plannedScores.visScore,
        value: `${plannedWorst.vis.toFixed(0)} m`,
        severity: getSeverity(plannedScores.visScore),
      },
      temperature: {
        score: plannedScores.tempScore,
        value: `${plannedWorst.temp.toFixed(1)}°C`,
        severity: getSeverity(plannedScores.tempScore),
      },
    };

    return {
      risk_score: plannedScores.total,
      recommendation: recommendationResult.recommendation,
      recommended_departure: recommendationResult.recommendedDeparture,
      risk_breakdown: breakdown,
      reason: reasons,
    };
  }
}
