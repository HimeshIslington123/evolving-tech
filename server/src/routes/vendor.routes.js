import express from "express";
import { getVendors,getVendorDashboard, getStaffDashboard, getAdminDashboard } from "../controller/vendor.controller.js"; 
import { authenticate } from "../middlewae/authMiddleware.js";

const router = express.Router();

router.get("/getvendor", getVendors);
router.get("/",authenticate, getVendorDashboard);
router.get("/dashboard", getStaffDashboard);
router.get("/admin", getAdminDashboard);


export default router;