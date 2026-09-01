import jwt from "jsonwebtoken";
import prisma from "../config/prisma.js";

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    // =====================================
    // CHECK AUTHORIZATION HEADER
    // =====================================

    if (!authHeader) {
      return res.status(401).json({
        message: "Authorization token is required",
      });
    }

    // =====================================
    // GET TOKEN
    // =====================================

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Invalid authorization format",
      });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        message: "Token is missing",
      });
    }

    // =====================================
    // VERIFY TOKEN
    // =====================================

    const decoded = jwt.verify(
      token,
      "SECRET_KEY"
    );

    // =====================================
    // GET USER FROM DATABASE
    // =====================================

    const user = await prisma.user.findUnique({
      where: {
        id: Number(decoded.id),
      },

      include: {
        vendor: true,
        staff: true,
        rider: true,
      },
    });

    // =====================================
    // USER NOT FOUND
    // =====================================

    if (!user) {
      return res.status(401).json({
        message: "User not found",
      });
    }

    // =====================================
    // CHECK FROZEN ACCOUNT
    // =====================================

    if (!user.isActive) {
      return res.status(403).json({
        message: "Your account has been frozen",
      });
    }

    // =====================================
    // SAVE USER IN REQUEST
    // =====================================

    req.user = user;

    next();

  } catch (error) {

    console.error(
      "AUTH MIDDLEWARE ERROR:",
      error
    );

    return res.status(401).json({
      message: "Invalid or expired token",
    });
  }
};

