import express from "express";

import {
  createReturnRequest,
  getMyReturns,
  getAllReturns,
  getReturnById,
  assignReturnRider,
  getMyRiderReturns,
  updateReturnStatus,
  cancelReturn,
} from "../controller/returnController.js";

// IMPORTANT:
// Change this import to whatever auth middleware
// your existing shipment routes already use.
import { authenticate } from "../middlewae/authMiddleware.js";

const router = express.Router();

// ============================================================
// VENDOR
// ============================================================

// Create return
router.post(
  "/",
  authenticate,
  createReturnRequest
);

// Get vendor returns
router.get(
  "/my",
  authenticate,
  getMyReturns
);

// Cancel return
router.patch(
  "/:id/cancel",
  authenticate,
  cancelReturn
);

// ============================================================
// ADMIN / STAFF
// ============================================================

// Get all returns
router.get(
  "/all",
  authenticate,
  getAllReturns
);

// Assign rider
router.patch(
  "/:id/assign-rider",
  authenticate,
  assignReturnRider
);

// ============================================================
// RIDER
// ============================================================

// Get rider returns
router.get(
  "/rider/my",
  authenticate,
  getMyRiderReturns
);

// ============================================================
// COMMON
// ============================================================

// Get one return
router.get(
  "/:id",
  authenticate,
  getReturnById
);

// Update status
router.patch(
  "/:id/status",
  authenticate,
  updateReturnStatus
);

export default router;