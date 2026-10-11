
import express from "express";

import {
  getVendors,
  getVendorDashboard,
  getStaffDashboard,
  getAdminDashboard,
} from "../controller/vendor.controller.js";

import {
  authenticate,
} from "../middlewae/authMiddleware.js";

const router = express.Router();

// Get all vendors
router.get("/getvendor", getVendors);

// Vendor dashboard
router.get("/", authenticate, getVendorDashboard);

// Staff dashboard
router.get("/dashboard", getStaffDashboard);

// Admin dashboard with period and warehouse filters
router.get("/admin", authenticate, getAdminDashboard);

export default router;
