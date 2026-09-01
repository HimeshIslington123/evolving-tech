import bcrypt from "bcrypt";
import prisma from "../config/prisma.js";
import jwt from "jsonwebtoken";
import { z } from "zod";

export const register = async (req, res) => {
  try {
    const schema = z.object({
      name: z
        .string()
        .min(2, "Name must be at least 2 characters"),

      email: z
        .string()
        .email("Invalid email"),

      password: z
        .string()
        .min(8, "Password must be at least 8 characters")
        .regex(/[A-Z]/, "Password must contain an uppercase letter")
        .regex(/[a-z]/, "Password must contain a lowercase letter")
        .regex(/[0-9]/, "Password must contain a number")
        .regex(
          /[^A-Za-z0-9]/,
          "Password must contain a special character"
        ),

      role: z.enum(["STAFF", "VENDOR", "RIDER"]),

      companyName: z.string().optional(),
      contactId: z.string().optional(),
      location: z.string().optional(),

      phone: z.string().optional(),
      profilePicture: z.string().optional(),
    });

    // Validate request body
    const validation = schema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        message: "Validation failed",
        errors: validation.error.flatten().fieldErrors,
      });
    }

    // Use validated data
    const {
      name,
      email,
      password,
      role,
      companyName,
      contactId,
      location,
      phone,
      profilePicture,
    } = validation.data;

    // Check email
    const exists = await prisma.user.findUnique({
      where: { email },
    });

    if (exists) {
      return res.status(400).json({
        message: "Email already exists",
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role,
      },
    });

    // Create vendor
    if (role === "VENDOR") {
      await prisma.vendor.create({
        data: {
          companyName,
          contactId,
          location,
          userId: user.id,
        },
      });
    }

    // Create rider
    if (role === "RIDER") {
      await prisma.rider.create({
        data: {
          phone,
          profilePicture,
          userId: user.id,
        },
      });
    }

    // Create staff
    if (role === "STAFF") {
      await prisma.staff.create({
        data: {
          phone,
          profilePicture,
          userId: user.id,
        },
      });
    }

    return res.status(201).json({
      message: "Registered Successfully",
    });

  } catch (err) {
    console.error(err);

    return res.status(500).json({
      message: "Server Error",
    });
  }
};

export const login = async (req, res) => {
  try {

    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (!user) {
      return res.status(404).json({
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
    // CHECK PASSWORD
    // =====================================

    const match = await bcrypt.compare(
      password,
      user.password
    );

    if (!match) {
      return res.status(400).json({
        message: "Invalid Password",
      });
    }

    // =====================================
    // CREATE JWT
    // =====================================

    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
      },
      "SECRET_KEY",
      {
        expiresIn: "7d",
      }
    );

    res.json({
      token,
      role: user.role,
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      message: "Server Error",
    });
  }
};