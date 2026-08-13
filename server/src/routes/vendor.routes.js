import express from "express";
import { getVendors,getVendorDashboard } from "../controller/vendor.controller.js"; 

const router = express.Router();

router.get("/getvendor", getVendors);
router.get("/dashboard", getVendorDashboard);


export default router;