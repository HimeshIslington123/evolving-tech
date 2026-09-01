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
} from "../controller/shipment.controller.js";

const router = express.Router();


router.post(
  "/",
  authenticate,
  createShipment
);

router.get("/", getAllShipments);
router.get("/my", authenticate, getMyShipments);
router.get(
  "/tracking/:trackingNumber",
  getShipmentByTracking
);

router.get(
  "/my-shipments",
  authenticate,
  getMyRiderShipments
);
router.get("/:id", getShipment);

router.put("/:id", updateShipment);

router.patch("/:id/status", updateStatus);

router.post("/:id/message", addShipmentMessage);

router.delete("/:id", deleteShipment);

router.patch(
  "/:id/assign-rider",
  assignRider
);
export default router;