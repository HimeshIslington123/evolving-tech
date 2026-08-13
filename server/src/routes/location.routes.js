import express from "express";
import { createLocationPrice, getLocations, reverseGeocode } from "../controller/location.controller.js";

const router = express.Router();

router.get("/getlocation", getLocations);

router.get("/reverse", reverseGeocode);

router.post("/createLocation", createLocationPrice);


export default router;