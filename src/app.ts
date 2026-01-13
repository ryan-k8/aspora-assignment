import express from 'express';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { IHourlyWeather } from '@/types';
import { createCommuteRoutes } from '@/routes/commute.routes';
import { CommuteController } from '@/controllers/commute.controller';
import { CommuteService } from '@/services/commute.service';
import { OpenMeteoProvider } from '@/services/providers/openmeteo.provider';
import { RuleBasedStrategy } from '@/services/strategies/rule-based.strategy';
import { WeatherRepository } from '@/repositories/weather.repository';
import { MemoryCache } from '@/utils/geohash-cache';
import { errorHandler } from '@/middleware/error.middleware';

dotenv.config();

export const createApp = () => {
  const app = express();

  // Middleware
  app.use(morgan('dev'));
  app.use(express.json());

  // DI
  const weatherProvider = new OpenMeteoProvider();
  const recommendationStrategy = new RuleBasedStrategy();
  const cache = new MemoryCache<IHourlyWeather[]>();
  const weatherRepository = new WeatherRepository(cache);

  const commuteService = new CommuteService(
    weatherProvider,
    recommendationStrategy,
    weatherRepository,
  );

  const commuteController = new CommuteController(commuteService);

  // Routes
  app.use(createCommuteRoutes(commuteController));

  // Health check
  app.get('/health-check', (req, res) => {
    res.send('up and running!');
  });

  // Error handling
  app.use(errorHandler);

  return app;
};
