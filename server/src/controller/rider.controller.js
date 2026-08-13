import bcrypt from "bcrypt";
import prisma from "../config/prisma.js";
import jwt from "jsonwebtoken";

export const createRider = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      phone,
      vehicleType,
      vehicleNumber,
    } = req.body;

    const existing = await prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (existing) {
      return res.status(400).json({
        message: "Email already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const rider = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          role: "RIDER",
        },
      });

      const rider = await tx.rider.create({
        data: {
          phone,
          vehicleType,
          vehicleNumber,
          userId: user.id,
        },
        include: {
          user: true,
        },
      });

      return rider;
    });

    res.status(201).json({
      message: "Rider created successfully",
      rider,
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: err.message,
    });
  }
};

export const getRiders = async (req, res) => {
  try {

    const riders = await prisma.rider.findMany({
      include: {
        user: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json(riders);

  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: "Server Error",
    });
  }
};

export const getRider = async (req, res) => {
  try {

    const rider = await prisma.rider.findUnique({
      where: {
        id: Number(req.params.id),
      },
      include: {
        user: true,
        shipments: true,
      },
    });

    if (!rider) {
      return res.status(404).json({
        message: "Rider not found",
      });
    }

    res.json(rider);

  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: "Server Error",
    });
  }
};

export const updateRider = async (req, res) => {
  try {

    const {
      name,
      phone,
      vehicleType,
      vehicleNumber,
      isAvailable,
    } = req.body;

    const rider = await prisma.rider.update({
      where: {
        id: Number(req.params.id),
      },
      data: {
        phone,
        vehicleType,
        vehicleNumber,
        isAvailable,
        user: {
          update: {
            name,
          },
        },
      },
      include: {
        user: true,
      },
    });

    res.json({
      message: "Rider updated successfully",
      rider,
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: "Server Error",
    });
  }
};

export const deleteRider = async (req, res) => {
  try {

    const rider = await prisma.rider.findUnique({
      where: {
        id: Number(req.params.id),
      },
    });

    if (!rider) {
      return res.status(404).json({
        message: "Rider not found",
      });
    }

    await prisma.user.delete({
      where: {
        id: rider.userId,
      },
    });

    res.json({
      message: "Rider deleted successfully",
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: "Server Error",
    });
  }
};





export const riderOrder = async (req, res) => {
  try {
    // TEMPORARY: logged-in/test rider
    const riderId = 1;

    const rider = await prisma.rider.findUnique({
      where: {
        id: riderId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        shipments: {
          include: {
            vendor: true,
            priceLocation: true,
            trackings: {
              orderBy: {
                createdAt: "desc",
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        },
      },
    });

    if (!rider) {
      return res.status(404).json({
        message: "Rider not found",
      });
    }

    return res.json(rider);
  } catch (err) {
    console.error("GET RIDER ERROR:", err);

    return res.status(500).json({
      message: "Server Error",
      error: err.message,
    });
  }
};

export const updateRiderLocation = async (req, res) => {
  try {
    // TEMPORARY: rider ID 1
    const riderId = 1;

    const { latitude, longitude } = req.body;

    if (
      typeof latitude !== "number" ||
      typeof longitude !== "number"
    ) {
      return res.status(400).json({
        message: "Latitude and longitude are required",
      });
    }

    // Update rider's current location
    const rider = await prisma.rider.update({
      where: {
        id: riderId,
      },
      data: {
        latitude,
        longitude,
      },
    });

    // Save location history
    const location = await prisma.riderLocation.create({
      data: {
        riderId,
        latitude,
        longitude,
      },
    });

    return res.json({
      message: "Location updated successfully",
      rider: {
        id: rider.id,
        latitude: rider.latitude,
        longitude: rider.longitude,
      },
      location,
    });
  } catch (err) {
    console.error("UPDATE RIDER LOCATION ERROR:", err);

    return res.status(500).json({
      message: "Server Error",
      error: err.message,
    });
  }
};

export const getRiderLocation = async (req, res) => {
  try {
    const riderId = 1;

    const rider = await prisma.rider.findUnique({
      where: {
        id: riderId,
      },
      select: {
        id: true,
        latitude: true,
        longitude: true,
        updatedAt: true,
      },
    });

    if (!rider) {
      return res.status(404).json({
        message: "Rider not found",
      });
    }

    return res.json({
      rider,
    });
  } catch (err) {
    console.error(
      "GET RIDER LOCATION ERROR:",
      err
    );

    return res.status(500).json({
      message: "Server Error",
      error: err.message,
    });
  }
};