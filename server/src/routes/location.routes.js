import express from "express";
import { createLocationPrice, deleteLocationPrice, getLocations, reverseGeocode, updateLocationPrice } from "../controller/location.controller.js";

const router = express.Router();

router.get("/getlocation", getLocations);

router.get("/reverse", reverseGeocode);

router.post("/createLocation", createLocationPrice);

router.put("/:id", updateLocationPrice);
router.delete("/:id", deleteLocationPrice);
export default router;