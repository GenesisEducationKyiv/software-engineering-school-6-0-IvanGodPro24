import { Router } from 'express';
import subscriptionRoutes from '../modules/subscriptions/subscription.routes.js';

const router = Router();

router.use('/', subscriptionRoutes);

export default router;
