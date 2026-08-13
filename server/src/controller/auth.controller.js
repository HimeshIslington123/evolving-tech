import bcrypt from "bcrypt";
import prisma from "../config/prisma.js";
import jwt from "jsonwebtoken";



export const register = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      role,
      companyName,
      contactId,
      location,
    } = req.body;



    const exists = await prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (exists) {
      return res.status(400).json({
        message: "Email already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role,
      },
    });

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

    res.status(201).json({
      message: "Registered Successfully",
    });

  } catch (err) {
    console.log(err);

    res.status(500).json({
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

    const match = await bcrypt.compare(
      password,
      user.password
    );

    if (!match) {
      return res.status(400).json({
        message: "Invalid Password",
      });
    }

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
      user,
    });

  } catch (err) {

    res.status(500).json({
      message: "Server Error",
    });

  }

};