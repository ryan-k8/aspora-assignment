import { Router } from 'express';
import { CommuteController } from '@/controllers/commute.controller';
import { validateCommuteRequest } from '@/middleware/validation.middleware';
import { asyncHandler } from '@/middleware/error.middleware';

export const createCommuteRoutes = (commuteController: CommuteController) => {
  const commuteRoutes = Router();
  commuteRoutes.post(
    '/commute-advice',
    validateCommuteRequest,
    asyncHandler(commuteController.getAdvice.bind(commuteController)),
  );
  return commuteRoutes;
};
