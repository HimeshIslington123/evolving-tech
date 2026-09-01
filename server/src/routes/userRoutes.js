import express from "express";

import {
  getMyProfile,
  getUserById,
  updateMyProfile,
  changePassword,
  deleteUser,
  toggleUserFreeze,
  getAllUsersExceptAdmin,
} from "../controller/userController.js";

import { authenticate } from "../middlewae/authMiddleware.js";
import { adminOnly } from "../middlewae/adminMiddleware.js";

const router = express.Router();

// All users except ADMIN
router.get("/", getAllUsersExceptAdmin);
// ======================================================
// MY PROFILE
// ======================================================

router.get(
  "/profile",
  authenticate,
  getMyProfile
);


// ======================================================
// UPDATE MY PROFILE
// ======================================================

router.patch(
  "/profile",
  authenticate,
  updateMyProfile
);


// ======================================================
// CHANGE PASSWORD
// ======================================================

router.patch(
  "/profile/password",
  authenticate,
  changePassword
);


// ======================================================
// ADMIN USER MANAGEMENT
// ======================================================

router.get(
  "/:id",
  authenticate,
  getUserById
);

router.delete(
  "/:id",
  authenticate,
  deleteUser
);

router.patch(
  "/:id/freeze",
  authenticate,
  adminOnly,
  toggleUserFreeze
);


export default router;