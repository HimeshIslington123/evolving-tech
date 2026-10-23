

import express from "express";

import {
  getWarehouses,
  getWarehouseById,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
} from "../controller/warehouseController.js";

const router = express.Router();

// GET all warehouses and search by name/city
router.get("/", getWarehouses);

// GET one warehouse by ID
router.get("/:id", getWarehouseById);

// CREATE warehouse
router.post("/", createWarehouse);

// UPDATE warehouse
router.put("/:id", updateWarehouse);

// DELETE warehouse
router.delete("/:id", deleteWarehouse);

export default router;
