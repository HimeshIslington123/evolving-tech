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

} from "../controller/rider.controller.js";

const router = express.Router();

router.get("/shipments", riderOrder);

router.post("/location", updateRiderLocation);

router.get("/location", getRiderLocation);

router.post("/", createRider);

router.get("/", getRiders);

router.get("/:id", getRider);

router.put("/:id", updateRider);

router.delete("/:id", deleteRider);



export default router;