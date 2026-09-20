import express from "express";

import {
  createRider,
  getRiders,
  getRider,
  updateRider,
  deleteRider,
  riderOrder,
  updateRiderLocation,
  getRiderLocation,
  trackRiderByVehicleNumber,
} from "../controller/rider.controller.js";

import { authenticate } from "../middlewae/authMiddleware.js";

const router = express.Router();

/*
|--------------------------------------------------------------------------
| RIDER SELF ROUTES
|--------------------------------------------------------------------------
*/

router.get(
  "/shipments",
  authenticate,
  riderOrder
);

router.post(
  "/location",
  authenticate,
  updateRiderLocation
);

router.get(
  "/location",
  authenticate,
  getRiderLocation
);

/*
|--------------------------------------------------------------------------
| PUBLIC VEHICLE TRACKING
|--------------------------------------------------------------------------
| No authentication required.
|
| Example:
| GET /api/rider/track/BA 12 PA 3456
|--------------------------------------------------------------------------
*/

router.get(
  "/track/:vehicleNumber",
  trackRiderByVehicleNumber
);

/*
|--------------------------------------------------------------------------
| ADMIN RIDER MANAGEMENT
|--------------------------------------------------------------------------
*/

router.post(
  "/",
  authenticate,
  createRider
);

router.get(
  "/",
  authenticate,
  getRiders
);

router.get(
  "/:id",
  authenticate,
  getRider
);

router.put(
  "/:id",
  authenticate,
  updateRider
);

router.delete(
  "/:id",
  authenticate,
  deleteRider
);

export default router;