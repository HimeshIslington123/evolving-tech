import express from "express";

import {
  getAccountingDashboard,
  getAccountingEntries,
  getAccountingEntryById,
  getAccountingVendors,
  getVendorAccounting,
  getUnsettledVendorEntries,
  getCodCollections,
  getSettlements,
  getSettlementById,
  createSettlement,
  processSettlement,
  completeSettlement,
  cancelSettlement,
  createUnregisteredVendor,
  registerVendorFromAccounting,
} from "../controller/adminAccountingController.js";

import { authenticate } from "../middlewae/authMiddleware.js";

const router = express.Router();

/*
|--------------------------------------------------------------------------
| DASHBOARD
|--------------------------------------------------------------------------
*/

router.get("/dashboard", authenticate, getAccountingDashboard);

/*
|--------------------------------------------------------------------------
| ACCOUNTING ENTRIES
|--------------------------------------------------------------------------
*/

router.get("/entries", authenticate, getAccountingEntries);

router.get("/entries/:id", authenticate, getAccountingEntryById);

/*
|--------------------------------------------------------------------------
| VENDORS
|--------------------------------------------------------------------------
| NOTE: the /unsettled route is declared before the bare /:vendorId route
| so Express never matches "unsettled" as a vendor id.
|--------------------------------------------------------------------------
*/

router.get("/vendors", authenticate, getAccountingVendors);

router.get(
  "/vendors/:vendorId/unsettled",
  authenticate,
  getUnsettledVendorEntries
);

router.get("/vendors/:vendorId", authenticate, getVendorAccounting);

/*
|--------------------------------------------------------------------------
| COD
|--------------------------------------------------------------------------
*/

router.get("/cod", authenticate, getCodCollections);

/*
|--------------------------------------------------------------------------
| SETTLEMENTS
|--------------------------------------------------------------------------
*/

router.get("/settlements", authenticate, getSettlements);

router.get("/settlements/:id", authenticate, getSettlementById);

router.post("/settlements", authenticate, createSettlement);

router.patch(
  "/settlements/:id/process",
  authenticate,
  processSettlement
);

router.patch("/settlements/:id/pay", authenticate, completeSettlement);

router.patch(
  "/settlements/:id/cancel",
  authenticate,
  cancelSettlement
);
router.post(
  "/unregistered-vendors",
  createUnregisteredVendor
);

router.patch(
  "/vendors/:vendorId/register",
  registerVendorFromAccounting
);
export default router;