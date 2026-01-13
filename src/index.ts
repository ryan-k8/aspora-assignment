import express, { Request, Response, NextFunction } from 'express';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { getCommuteAdvice } from './commute';
import { ICommuteRequest } from './types';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(morgan('dev'));
app.use(express.json());

// Validation middleware for commute-advice
const validateCommuteRequest = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const body = req.body;

  if (!body.home || !body.office || !body.plannedDeparture) {
    return res.status(400).json({
      error: 'Missing required fields: home, office, plannedDeparture',
    });
  }

  if (
    !body.home.latitude ||
    !body.home.longitude ||
    !body.office.latitude ||
    !body.office.longitude
  ) {
    return res.status(400).json({
      error: 'Invalid location format. Must include latitude and longitude.',
    });
  }

  const { latitude: homeLat, longitude: homeLon } = body.home;
  const { latitude: officeLat, longitude: officeLon } = body.office;

  if (
    homeLat < -90 ||
    homeLat > 90 ||
    homeLon < -180 ||
    homeLon > 180 ||
    officeLat < -90 ||
    officeLat > 90 ||
    officeLon < -180 ||
    officeLon > 180
  ) {
    return res.status(400).json({
      error:
        'Invalid coordinates. Latitude must be between -90 and 90, longitude between -180 and 180.',
    });
  }

  let plannedTime: Date;
  if (body.plannedDeparture === 'leave now') {
    plannedTime = new Date();
  } else {
    plannedTime = new Date(body.plannedDeparture);
    if (isNaN(plannedTime.getTime())) {
      return res.status(400).json({
        error:
          'Invalid plannedDeparture. Must be ISO 8601 string or "leave now".',
      });
    }
    const now = new Date();
    if (plannedTime < now) {
      return res
        .status(400)
        .json({ error: 'plannedDeparture cannot be in the past.' });
    }
    const maxFuture = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 days
    if (plannedTime > maxFuture) {
      return res.status(400).json({
        error:
          'plannedDeparture is too far in the future. Maximum 14 days ahead.',
      });
    }
  }

  if (body.commuteDuration !== undefined) {
    if (
      typeof body.commuteDuration !== 'number' ||
      body.commuteDuration <= 0 ||
      body.commuteDuration > 12 * 60
    ) {
      return res.status(400).json({
        error:
          'Invalid commuteDuration. Must be a positive number <= 720 minutes (12 hours).',
      });
    }
  }

  next();
};

app.get('/health-check', (req: Request, res: Response) => {
  res.send('up and running!');
});

app.post(
  '/commute-advice',
  validateCommuteRequest,
  async (req: Request, res: Response) => {
    try {
      const body: ICommuteRequest = req.body;
      const advice = await getCommuteAdvice(body);
      res.json(advice);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to get commute advice' });
    }
  },
);

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
