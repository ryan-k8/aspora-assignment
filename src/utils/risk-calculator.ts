export interface IRiskValues {
  temp: number;
  precip: number;
  wind: number;
  vis: number;
  aqi: number;
}

export interface IRiskScores {
  total: number;
  precipScore: number;
  aqiScore: number;
  windScore: number;
  visScore: number;
  tempScore: number;
}

// Compute sub-scores
export function computeSubScores(values: IRiskValues): IRiskScores {
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
export function getSeverity(score: number): 'Low' | 'Medium' | 'High' {
  if (score <= 10) return 'Low';
  if (score <= 25) return 'Medium';
  return 'High';
}

// Generate static reasons
export function generateStaticReasons(
  plannedScores: IRiskScores,
  plannedWorst: IRiskValues,
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
