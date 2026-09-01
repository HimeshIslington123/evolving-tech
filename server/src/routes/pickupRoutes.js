import express from "express";


import {
  getMyPickups,
  createPickup,
  getAllPickups,
  assignRiderToPickup,
  pickupDone,
  cancelPickup,
  getMyRiderPickups,
} from "../controller/pickupController.js";
import { authenticate } from "../middlewae/authMiddleware.js";

const router = express.Router();

// Vendor creates pickup request
router.post("/", authenticate, createPickup);

// Staff gets all pickup requests
//need to add roles
router.get("/all", authenticate, getAllPickups);

router.get("/", authenticate, getMyPickups);
router.get("/rider", authenticate, getMyRiderPickups);

router.patch("/:pickupId/assign-rider",authenticate, assignRiderToPickup);

router.patch("/:pickupId/pickup-done",authenticate, pickupDone);


router.patch("/:pickupId/cancel", authenticate,cancelPickup);

export default router;
