import express from "express";

import {
  authenticate,
} from "../middlewae/authMiddleware.js";

import {
  createShipment,
  getAllShipments,
  getShipment,
  updateShipment,
  updateStatus,
  assignRider,
  deleteShipment,
  getShipmentByTracking,
  addShipmentMessage,
  getMyShipments,
  getMyRiderShipments,
  scanShipment,
  scanShipmentAction,
} from "../controller/shipment.controller.js";

const router = express.Router();

// =====================================
// CREATE SHIPMENT
// =====================================
router.post(
  "/",
  authenticate,
  createShipment
);

// =====================================
// GET ALL SHIPMENTS
// =====================================
router.get(
  "/",
  authenticate,
  getAllShipments
);

// =====================================
// GET MY VENDOR SHIPMENTS
// =====================================
router.get(
  "/my",
  authenticate,
  getMyShipments
);

// =====================================
// PUBLIC TRACKING
// =====================================
router.get(
  "/tracking/:trackingNumber",
  getShipmentByTracking
);

// =====================================
// GET MY RIDER SHIPMENTS
// =====================================
router.get(
  "/my-shipments",
  authenticate,
  getMyRiderShipments
);

// =====================================
// GET SINGLE SHIPMENT
// =====================================
router.get(
  "/:id",
  authenticate,
  getShipment
);

// =====================================
// UPDATE SHIPMENT
// =====================================
router.put(
  "/:id",
  authenticate,
  updateShipment
);

// =====================================
// UPDATE SHIPMENT STATUS
// IMPORTANT: authenticate added
// =====================================
router.patch(
  "/:id/status",
  authenticate,
  updateStatus
);

// =====================================
// ADD SHIPMENT MESSAGE
// =====================================
router.post(
  "/:id/message",
  authenticate,
  addShipmentMessage
);

// =====================================
// DELETE SHIPMENT
// =====================================
router.delete(
  "/:id",
  authenticate,
  deleteShipment
);
router.post(
  "/scan",
  authenticate,
  scanShipment
);

router.post(
  "/scan/action",
  authenticate,
  scanShipmentAction
);
// =====================================
// ASSIGN RIDER
// =====================================
router.patch(
  "/:id/assign-rider",
  authenticate,
  assignRider
);

export default router;