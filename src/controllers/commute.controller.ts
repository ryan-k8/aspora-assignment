import { Request, Response } from 'express';
import { ICommuteRequest } from '@/types';
import { CommuteService } from '@/services/commute.service';

export class CommuteController {
  constructor(private commuteService: CommuteService) {}

  async getAdvice(req: Request, res: Response) {
    const request: ICommuteRequest = req.body;
    const result = await this.commuteService.getCommuteAdvice(request);
    res.json(result);
  }
}
