import express from "express";

import {
  createLocation,
  getLocations,
  getLocationById,
  updateLocation,
  deleteLocation,
} from "../controller/locationnew.controller.js";

const router = express.Router();

router.post("/", createLocation);

router.get("/", getLocations);

router.get("/:id", getLocationById);

router.put("/:id", updateLocation);

router.delete("/:id", deleteLocation);

export default router;