import {
  ICommuteRequest,
  ICommuteResponse,
  IHourlyWeather,
  IRiskComponent,
  IStructuredBreakdown,
} from './types';
import { getWeatherData } from './openmeteo';

const EARLY_OFFSET_MIN = 20;
const LATE_OFFSET_MIN = 20;

// Function to get max values for a time window
function getMaxForWindow(
  data: IHourlyWeather,
  start: Date,
  durationMin: number,
): {
  temp: number;
  precip: number;
  wind: number;
  vis: number;
  aqi: number;
} {
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
function getWorstCase(
  homeData: IHourlyWeather,
  officeData: IHourlyWeather,
  start: Date,
  duration: number,
): {
  temp: number;
  precip: number;
  wind: number;
  vis: number;
  aqi: number;
} {
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

// Compute sub-scores
function computeSubScores(values: {
  temp: number;
  precip: number;
  wind: number;
  vis: number;
  aqi: number;
}): {
  total: number;
  precipScore: number;
  aqiScore: number;
  windScore: number;
  visScore: number;
  tempScore: number;
} {
  let precipScore = 0;
  if (values.precip > 80) precipScore = 45;
  else if (values.precip > 60) precipScore = 35;
  else if (values.precip > 40) precipScore = 25;
  else if (values.precip > 20) precipScore = 15;
  let aqiScore = 0;
  if (values.aqi > 150) aqiScore = 40;
  else if (values.aqi > 100) aqiScore = 25;
  else if (values.aqi > 50) aqiScore = 10;
  let windScore = 0;
  if (values.wind > 40) windScore = 25;
  else if (values.wind > 25) windScore = 15;
  let visScore = 0;
  if (values.vis < 500) visScore = 20;
  else if (values.vis < 2000) visScore = 10;
  let tempScore = 0;
  if (values.temp < 0 || values.temp > 35) tempScore = 10;
  const total = Math.min(
    100,
    precipScore + aqiScore + windScore + visScore + tempScore,
  );
  return { total, precipScore, aqiScore, windScore, visScore, tempScore };
}

// Get severity
function getSeverity(score: number): 'Low' | 'Medium' | 'High' {
  if (score <= 10) return 'Low';
  if (score <= 25) return 'Medium';
  return 'High';
}

// Generate static reasons
function generateStaticReasons(
  plannedScores: any,
  plannedWorst: any,
): string[] {
  const reasons: string[] = [];
  if (plannedScores.precipScore > 0)
    reasons.push(
      `Rain probability ${plannedWorst.precip.toFixed(0)}% during planned window`,
    );
  if (plannedScores.aqiScore > 0)
    reasons.push(
      `Air quality AQI ${plannedWorst.aqi.toFixed(0)} during planned window`,
    );
  if (plannedScores.windScore > 0)
    reasons.push(
      `Wind speed ${plannedWorst.wind.toFixed(1)} km/h during planned window`,
    );
  if (plannedScores.visScore > 0)
    reasons.push(
      `Visibility ${plannedWorst.vis.toFixed(0)} m during planned window`,
    );
  if (plannedScores.tempScore > 0)
    reasons.push(
      `Temperature ${plannedWorst.temp.toFixed(1)}°C during planned window`,
    );
  return reasons;
}

// Determine recommendation
function determineRecommendation(
  plannedScores: any,
  earlyScores: any,
  lateScores: any,
  plannedDeparture: string,
  earlyTime: Date,
  lateTime: Date,
): { recommendation: string; recommendedDeparture: string; reasons: string[] } {
  const reasons: string[] = [];

  // Check if all scores are high
  if (
    plannedScores.total > 70 &&
    earlyScores.total > 70 &&
    lateScores.total > 70
  ) {
    return {
      recommendation: 'Avoid travel if possible',
      recommendedDeparture: plannedDeparture,
      reasons: ['High risk in all time windows'],
    };
  }

  // If planned is low risk, no change
  if (plannedScores.total < 25) {
    return {
      recommendation: 'No change needed',
      recommendedDeparture: plannedDeparture,
      reasons: [],
    };
  }

  // Calculate improvements
  const earlyDiff = plannedScores.total - earlyScores.total;
  const lateDiff = plannedScores.total - lateScores.total;

  // Determine the best option
  let bestOption: { time: Date; diff: number; label: string } | null = null;

  if (earlyDiff > 15 && lateDiff > 15) {
    // Both are better, choose the one with lower score
    bestOption =
      earlyScores.total < lateScores.total
        ? {
            time: earlyTime,
            diff: earlyDiff,
            label: `Leave ${EARLY_OFFSET_MIN} minutes earlier`,
          }
        : {
            time: lateTime,
            diff: lateDiff,
            label: `Leave ${LATE_OFFSET_MIN} minutes later`,
          };
  } else if (earlyDiff > 15) {
    bestOption = {
      time: earlyTime,
      diff: earlyDiff,
      label: `Leave ${EARLY_OFFSET_MIN} minutes earlier`,
    };
  } else if (lateDiff > 15) {
    bestOption = {
      time: lateTime,
      diff: lateDiff,
      label: `Leave ${LATE_OFFSET_MIN} minutes later`,
    };
  }

  if (bestOption) {
    reasons.push(
      `Leaving ${bestOption.label.toLowerCase().replace('leave ', '')} reduces risk by ${bestOption.diff.toFixed(0)} points`,
    );
    return {
      recommendation: bestOption.label,
      recommendedDeparture: bestOption.time.toISOString(),
      reasons,
    };
  }

  // No better option
  return {
    recommendation: 'No change needed',
    recommendedDeparture: plannedDeparture,
    reasons: [],
  };
}

export async function getCommuteAdvice(
  request: ICommuteRequest,
): Promise<ICommuteResponse> {
  const { home, office, plannedDeparture, commuteDuration = 45 } = request;

  const plannedTime =
    plannedDeparture === 'leave now' ? new Date() : new Date(plannedDeparture);
  const startDate = new Date(plannedTime.getTime() - 60 * 60 * 1000); // 1 hour before
  const endDate = new Date(plannedTime.getTime() + 4 * 60 * 60 * 1000); // 4 hours after

  const locations = [home, office];
  const weatherData = await getWeatherData(locations, startDate, endDate);

  // Log the fetched weather data for debugging
  console.log(
    `Fetched weather data from ${startDate.toISOString()} to ${endDate.toISOString()}`,
  );
  console.log('Home location weather summary:', {
    avgTemp:
      weatherData[0].temperature.reduce((a, b) => a + b, 0) /
      weatherData[0].temperature.length,
    maxPrecipProb: Math.max(...weatherData[0].precipitationProbability),
    maxWind: Math.max(...weatherData[0].windSpeed),
    minVis: Math.min(...weatherData[0].visibility),
    maxAQI: Math.max(...weatherData[0].aqi),
  });
  console.log('Office location weather summary:', {
    avgTemp:
      weatherData[1].temperature.reduce((a, b) => a + b, 0) /
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

  // Determine recommendation
  const {
    recommendation,
    recommendedDeparture,
    reasons: recReasons,
  } = determineRecommendation(
    plannedScores,
    earlyScores,
    lateScores,
    plannedDeparture,
    earlyTime,
    lateTime,
  );

  // Add static reasons
  const staticReasons = generateStaticReasons(plannedScores, plannedWorst);
  const reasons = [...recReasons, ...staticReasons];

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
    recommendation,
    recommended_departure: recommendedDeparture,
    risk_breakdown: breakdown,
    reason: reasons,
  };
}
