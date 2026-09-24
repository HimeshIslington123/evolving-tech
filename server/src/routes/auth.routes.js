import express from "express";
import { register,login, getUserDetails } from "../controller/auth.controller.js"; 

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.get(
  "/:id/details",
  getUserDetails
);
export default router;