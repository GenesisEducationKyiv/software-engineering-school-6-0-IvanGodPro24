import { Router } from 'express';
import subscriptionRoutes from './subscription.routes.js';

const router = Router();

router.use('/', subscriptionRoutes);

export default router;
