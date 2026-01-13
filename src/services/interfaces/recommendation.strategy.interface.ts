import { IRiskScores } from '@/utils/risk-calculator';

export interface IRecommendation {
  recommendation: string;
  recommendedDeparture: string;
  reasons: string[];
}

export interface IRecommendationStrategy {
  generateRecommendation(
    planned: IRiskScores,
    early: IRiskScores,
    late: IRiskScores,
    plannedDeparture: string,
    earlyTime: Date,
    lateTime: Date,
  ): IRecommendation;
}
