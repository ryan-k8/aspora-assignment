import { IRiskScores } from '@/utils/risk-calculator';
import {
  IRecommendation,
  IRecommendationStrategy,
} from '@/services/interfaces/recommendation.strategy.interface';

const EARLY_OFFSET_MIN = 20;
const LATE_OFFSET_MIN = 20;

export class RuleBasedStrategy implements IRecommendationStrategy {
  generateRecommendation(
    plannedScores: IRiskScores,
    earlyScores: IRiskScores,
    lateScores: IRiskScores,
    plannedDeparture: string,
    earlyTime: Date,
    lateTime: Date,
  ): IRecommendation {
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
}
