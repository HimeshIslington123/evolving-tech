import express from "express";

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
} from "../controller/shipment.controller.js";

const router = express.Router();

router.post("/", createShipment);

router.get("/", getAllShipments);

router.get(
  "/tracking/:trackingNumber",
  getShipmentByTracking
);

router.get("/:id", getShipment);

router.put("/:id", updateShipment);

router.patch("/:id/status", updateStatus);

router.post("/:id/message", addShipmentMessage);

router.delete("/:id", deleteShipment);

router.patch("/:id/assign-rider", assignRider);
export default router;