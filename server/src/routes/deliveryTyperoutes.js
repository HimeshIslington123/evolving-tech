import express from "express";

import {
  createDeliveryType,
  getDeliveryTypes,
  getDeliveryTypeById,
  updateDeliveryType,
  deleteDeliveryType,
} from "../controller/deliveryType.controller.js";

const router = express.Router();

router.post("/", createDeliveryType);

router.get("/", getDeliveryTypes);

router.get("/:id", getDeliveryTypeById);

router.put("/:id", updateDeliveryType);

router.delete("/:id", deleteDeliveryType);

export default router;