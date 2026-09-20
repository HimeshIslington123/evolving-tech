import bcrypt from "bcrypt";
import prisma from "../config/prisma.js";
import jwt from "jsonwebtoken";

/*
|--------------------------------------------------------------------------
| CREATE RIDER
|--------------------------------------------------------------------------
| Usually called by admin.
| Vehicle information is OPTIONAL.
|--------------------------------------------------------------------------
*/

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

    if (!name || !email || !password || !phone) {
      return res.status(400).json({
        message: "Name, email, password and phone are required",
      });
    }

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

          // Optional vehicle information
          vehicleType: vehicleType || null,
          vehicleNumber: vehicleNumber || null,

          userId: user.id,
        },

        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              isActive: true,
            },
          },
        },
      });

      return rider;
    });

    return res.status(201).json({
      success: true,
      message: "Rider created successfully",
      rider,
    });
  } catch (err) {
    console.error("CREATE RIDER ERROR:", err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};


/*
|--------------------------------------------------------------------------
| GET ALL RIDERS
|--------------------------------------------------------------------------
| Admin use.
|--------------------------------------------------------------------------
*/

export const getRiders = async (req, res) => {
  try {
    const riders = await prisma.rider.findMany({
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
            createdAt: true,
          },
        },
      },

      orderBy: {
        createdAt: "desc",
      },
    });

    return res.json({
      success: true,
      riders,
    });
  } catch (err) {
    console.error("GET RIDERS ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};


/*
|--------------------------------------------------------------------------
| GET SINGLE RIDER
|--------------------------------------------------------------------------
| Admin can get any rider by ID.
|--------------------------------------------------------------------------
*/

export const getRider = async (req, res) => {
  try {
    const riderId = Number(req.params.id);

    if (!Number.isInteger(riderId)) {
      return res.status(400).json({
        message: "Invalid rider ID",
      });
    }

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
            isActive: true,
            createdAt: true,
          },
        },

        shipments: {
          include: {
            vendor: true,

            // Your Prisma schema uses locationRate,
            // not priceLocation.
            locationRate: true,

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

    return res.json({
      success: true,
      rider,
    });
  } catch (err) {
    console.error("GET RIDER ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};


/*
|--------------------------------------------------------------------------
| UPDATE RIDER
|--------------------------------------------------------------------------
| Admin can update rider information.
| Vehicle information remains optional.
|--------------------------------------------------------------------------
*/

export const updateRider = async (req, res) => {
  try {
    const riderId = Number(req.params.id);

    if (!Number.isInteger(riderId)) {
      return res.status(400).json({
        message: "Invalid rider ID",
      });
    }

    const {
      name,
      phone,
      vehicleType,
      vehicleNumber,
      isAvailable,
    } = req.body;

    const existingRider = await prisma.rider.findUnique({
      where: {
        id: riderId,
      },

      include: {
        user: true,
      },
    });

    if (!existingRider) {
      return res.status(404).json({
        message: "Rider not found",
      });
    }

    const rider = await prisma.rider.update({
      where: {
        id: riderId,
      },

      data: {
        /*
        |--------------------------------------------------------------------------
        | Only update fields that were actually sent.
        |--------------------------------------------------------------------------
        */

        ...(phone !== undefined && {
          phone,
        }),

        ...(vehicleType !== undefined && {
          vehicleType: vehicleType || null,
        }),

        ...(vehicleNumber !== undefined && {
          vehicleNumber: vehicleNumber || null,
        }),

        ...(isAvailable !== undefined && {
          isAvailable,
        }),

        user: {
          update: {
            ...(name !== undefined && {
              name,
            }),
          },
        },
      },

      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
          },
        },
      },
    });

    return res.json({
      success: true,
      message: "Rider updated successfully",
      rider,
    });
  } catch (err) {
    console.error("UPDATE RIDER ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: err.message,
    });
  }
};

/* ============================================================
   PUBLIC: TRACK RIDER BY VEHICLE NUMBER
============================================================ */

export const trackRiderByVehicleNumber = async (req, res) => {
  try {
    const vehicleNumber = String(
      req.params.vehicleNumber || "",
    ).trim();

    if (!vehicleNumber) {
      return res.status(400).json({
        success: false,
        message: "Vehicle number is required.",
      });
    }

    const rider = await prisma.rider.findFirst({
      where: {
        vehicleNumber: {
          equals: vehicleNumber,
          mode: "insensitive",
        },
      },

      include: {
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!rider) {
      return res.status(404).json({
        success: false,
        message: "No rider found with this vehicle number.",
      });
    }

    return res.status(200).json({
      success: true,

      rider: {
        id: rider.id,

        name: rider.user?.name || "Rider",

        vehicleType: rider.vehicleType,

        vehicleNumber: rider.vehicleNumber,

        isAvailable: rider.isAvailable,

        latitude: rider.latitude,

        longitude: rider.longitude,
      },
    });
  } catch (error) {
    console.error(
      "Track rider by vehicle number error:",
      error,
    );

    return res.status(500).json({
      success: false,
      message: "Failed to track vehicle.",
    });
  }
};
/*
|--------------------------------------------------------------------------
| DELETE RIDER
|--------------------------------------------------------------------------
| Delete user.
| Because User -> Rider is a required relation without explicit
| onDelete behavior, delete Rider first, then User.
|--------------------------------------------------------------------------
*/

export const deleteRider = async (req, res) => {
  try {
    const riderId = Number(req.params.id);

    if (!Number.isInteger(riderId)) {
      return res.status(400).json({
        message: "Invalid rider ID",
      });
    }

    const rider = await prisma.rider.findUnique({
      where: {
        id: riderId,
      },
    });

    if (!rider) {
      return res.status(404).json({
        message: "Rider not found",
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.rider.delete({
        where: {
          id: riderId,
        },
      });

      await tx.user.delete({
        where: {
          id: rider.userId,
        },
      });
    });

    return res.json({
      success: true,
      message: "Rider deleted successfully",
    });
  } catch (err) {
    console.error("DELETE RIDER ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: err.message,
    });
  }
};


/*
|--------------------------------------------------------------------------
| RIDER ORDERS
|--------------------------------------------------------------------------
| IMPORTANT:
| No more:
|
| const riderId = 1;
|
| We get the logged-in rider from req.user.rider.id.
|--------------------------------------------------------------------------
*/

export const riderOrder = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    if (!req.user.rider) {
      return res.status(403).json({
        message: "Rider account required",
      });
    }

    const riderId = req.user.rider.id;

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

            // Correct relation from your Prisma schema
            locationRate: true,

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

    return res.json({
      success: true,
      rider,
    });
  } catch (err) {
    console.error("GET RIDER ORDERS ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: err.message,
    });
  }
};


/*
|--------------------------------------------------------------------------
| UPDATE RIDER LOCATION
|--------------------------------------------------------------------------
| Uses the authenticated rider.
|--------------------------------------------------------------------------
*/

export const updateRiderLocation = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    if (!req.user.rider) {
      return res.status(403).json({
        message: "Rider account required",
      });
    }

    const riderId = req.user.rider.id;

    const {
      latitude,
      longitude,
    } = req.body;

    if (
      typeof latitude !== "number" ||
      typeof longitude !== "number"
    ) {
      return res.status(400).json({
        message: "Latitude and longitude are required",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Validate coordinates
    |--------------------------------------------------------------------------
    */

    if (latitude < -90 || latitude > 90) {
      return res.status(400).json({
        message: "Invalid latitude",
      });
    }

    if (longitude < -180 || longitude > 180) {
      return res.status(400).json({
        message: "Invalid longitude",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Update current rider location
    |--------------------------------------------------------------------------
    */

    const rider = await prisma.rider.update({
      where: {
        id: riderId,
      },

      data: {
        latitude,
        longitude,
      },
    });

    /*
    |--------------------------------------------------------------------------
    | Save location history
    |--------------------------------------------------------------------------
    */

    const location = await prisma.riderLocation.create({
      data: {
        riderId,
        latitude,
        longitude,
      },
    });

    return res.json({
      success: true,
      message: "Location updated successfully",

      rider: {
        id: rider.id,
        latitude: rider.latitude,
        longitude: rider.longitude,
      },

      location,
    });
  } catch (err) {
    console.error(
      "UPDATE RIDER LOCATION ERROR:",
      err
    );

    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: err.message,
    });
  }
};


/*
|--------------------------------------------------------------------------
| GET RIDER LOCATION
|--------------------------------------------------------------------------
| Uses the authenticated rider.
|--------------------------------------------------------------------------
*/

export const getRiderLocation = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    if (!req.user.rider) {
      return res.status(403).json({
        message: "Rider account required",
      });
    }

    const riderId = req.user.rider.id;

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
      success: true,
      rider,
    });
  } catch (err) {
    console.error(
      "GET RIDER LOCATION ERROR:",
      err
    );

    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: err.message,
    });
  }
};