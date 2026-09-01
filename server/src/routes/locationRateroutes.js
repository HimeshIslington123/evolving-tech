import express from "express";

import {
  createLocationRate,
  getLocationRates,
  getLocationRateById,
  getRatesByLocation,
  updateLocationRate,
  deleteLocationRate,
} from "../controller/locationRate.controller.js";

const router = express.Router();

router.post("/", createLocationRate);

router.get("/", getLocationRates);

router.get(
  "/location/:locationId",
  getRatesByLocation
);

router.get("/:id", getLocationRateById);

router.put("/:id", updateLocationRate);

router.delete("/:id", deleteLocationRate);

export default router;