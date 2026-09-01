import prisma from "../config/prisma.js";

// =====================================
// CREATE PICKUP REQUEST
// =====================================

export const createPickup = async (req, res) => {
  try {
    const {
      totalPackages,
      pickupAddress,
      pickupPhone,
      notes,
    } = req.body;

    // Check required fields
    if (!totalPackages || !pickupAddress || !pickupPhone) {
      return res.status(400).json({
        message:
          "Total packages, pickup address and pickup phone are required",
      });
    }

    // Get logged-in user from JWT
    const userId = req.user.id;

    // Find vendor using logged-in user's ID
    const vendor = await prisma.vendor.findUnique({
      where: {
        userId: userId,
      },
    });

    if (!vendor) {
      return res.status(404).json({
        message: "Vendor not found",
      });
    }

    // Create pickup
    const pickup = await prisma.pickup.create({
      data: {
        totalPackages: Number(totalPackages),
        pickupAddress,
        pickupPhone,
        notes,
        vendorId: vendor.id,
      },
    });

    res.status(201).json({
      message: "Pickup request created successfully",
      pickup,
    });
  } catch (err) {
    console.log(err);

    res.status(500).json({
      message: "Server Error",
    });
  }
};

// =====================================
// GET ALL PICKUPS
// =====================================

export const getAllPickups = async (req, res) => {
  try {
    const pickups = await prisma.pickup.findMany({
      include: {
        vendor: {
          select: {
            id: true,
            companyName: true,
            contactId: true,
            location: true,
          },
        },

        rider: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },

      orderBy: {
        createdAt: "desc",
      },
    });

    res.status(200).json({
      message: "Pickup requests fetched successfully",
      pickups,
    });
  } catch (err) {
    console.log(err);

    res.status(500).json({
      message: "Server Error",
    });
  }
};

// =====================================
// GET MY PICKUPS
// =====================================

export const getMyPickups = async (req, res) => {
  try {
    const userId = req.user.id;

    const vendor = await prisma.vendor.findUnique({
      where: {
        userId: userId,
      },
    });

    if (!vendor) {
      return res.status(404).json({
        message: "Vendor not found",
      });
    }

    const pickups = await prisma.pickup.findMany({
      where: {
        vendorId: vendor.id,
      },

      include: {
        rider: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },

      orderBy: {
        createdAt: "desc",
      },
    });

    res.status(200).json({
      message: "Pickup requests fetched successfully",
      pickups,
    });
  } catch (err) {
    console.log(err);

    res.status(500).json({
      message: "Server Error",
    });
  }
};

// =====================================
// ASSIGN RIDER TO PICKUP
// =====================================

export const assignRiderToPickup = async (req, res) => {
  try {
    const pickupId = Number(req.params.pickupId);
    const riderId = Number(req.body.riderId);

    if (!pickupId || !riderId) {
      return res.status(400).json({
        message: "Pickup ID and rider ID are required",
      });
    }

    // Find pickup
    const pickup = await prisma.pickup.findUnique({
      where: {
        id: pickupId,
      },
    });

    if (!pickup) {
      return res.status(404).json({
        message: "Pickup not found",
      });
    }

    // Only REQUESTED pickups can receive a rider
    if (pickup.status !== "REQUESTED") {
      return res.status(400).json({
        message: `Cannot assign rider to a pickup with status ${pickup.status}`,
      });
    }

    // Find rider
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
          },
        },
      },
    });

    if (!rider) {
      return res.status(404).json({
        message: "Rider not found",
      });
    }

    // Check rider availability
    if (!rider.isAvailable) {
      return res.status(400).json({
        message: "This rider is currently unavailable",
      });
    }

    // Assign rider
    const updatedPickup = await prisma.pickup.update({
      where: {
        id: pickupId,
      },

      data: {
        riderId: riderId,
        status: "ASSIGNED",
      },

      include: {
        vendor: {
          select: {
            id: true,
            companyName: true,
            contactId: true,
            location: true,
          },
        },

        rider: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    res.status(200).json({
      message: "Rider assigned successfully",
      pickup: updatedPickup,
    });
  } catch (err) {
    console.error("ASSIGN RIDER ERROR:", err);

    res.status(500).json({
      message: "Failed to assign rider",
    });
  }
};

// =====================================
// MARK PICKUP AS DONE
// =====================================

export const pickupDone = async (req, res) => {
  try {
    const pickupId = Number(req.params.pickupId);

    if (!pickupId) {
      return res.status(400).json({
        message: "Pickup ID is required",
      });
    }

    const pickup = await prisma.pickup.findUnique({
      where: {
        id: pickupId,
      },
    });

    if (!pickup) {
      return res.status(404).json({
        message: "Pickup not found",
      });
    }

    // Must be assigned first
    if (pickup.status !== "ASSIGNED") {
      return res.status(400).json({
        message:
          "Only assigned pickups can be marked as pickup done",
      });
    }

    if (!pickup.riderId) {
      return res.status(400).json({
        message: "Pickup does not have an assigned rider",
      });
    }

    const updatedPickup = await prisma.pickup.update({
      where: {
        id: pickupId,
      },

      data: {
        status: "PICKUP_DONE",
      },

      include: {
        vendor: {
          select: {
            id: true,
            companyName: true,
            contactId: true,
            location: true,
          },
        },

        rider: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    res.status(200).json({
      message: "Pickup marked as completed",
      pickup: updatedPickup,
    });
  } catch (err) {
    console.error("PICKUP DONE ERROR:", err);

    res.status(500).json({
      message: "Failed to complete pickup",
    });
  }
};

// =====================================
// CANCEL PICKUP
// =====================================

export const cancelPickup = async (req, res) => {
  try {
    const pickupId = Number(req.params.pickupId);

    if (!pickupId) {
      return res.status(400).json({
        message: "Pickup ID is required",
      });
    }

    const pickup = await prisma.pickup.findUnique({
      where: {
        id: pickupId,
      },
    });

    if (!pickup) {
      return res.status(404).json({
        message: "Pickup not found",
      });
    }

    // Cannot cancel completed or already cancelled pickup
    if (
      pickup.status === "PICKUP_DONE" ||
      pickup.status === "CANCELLED"
    ) {
      return res.status(400).json({
        message: `Cannot cancel pickup with status ${pickup.status}`,
      });
    }

    const updatedPickup = await prisma.pickup.update({
      where: {
        id: pickupId,
      },

      data: {
        status: "CANCELLED",
      },

      include: {
        vendor: {
          select: {
            id: true,
            companyName: true,
            contactId: true,
            location: true,
          },
        },

        rider: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    res.status(200).json({
      message: "Pickup cancelled successfully",
      pickup: updatedPickup,
    });
  } catch (err) {
    console.error("CANCEL PICKUP ERROR:", err);

    res.status(500).json({
      message: "Failed to cancel pickup",
    });
  }
};
// =====================================
// GET PICKUPS ASSIGNED TO LOGGED-IN RIDER
// =====================================

export const getMyRiderPickups = async (req, res) => {
  try {
    const userId = req.user.id;

    // Find rider using logged-in user's ID
    const rider = await prisma.rider.findUnique({
      where: {
        userId: userId,
      },
    });

    if (!rider) {
      return res.status(404).json({
        message: "Rider not found",
      });
    }

    // Get pickups assigned to this rider
    const pickups = await prisma.pickup.findMany({
      where: {
        riderId: rider.id,
      },

      include: {
        vendor: {
          select: {
            id: true,
            companyName: true,
            contactId: true,
            location: true,
          },
        },

        rider: {
          select: {
            id: true,
            phone: true,
            profilePicture: true,
            latitude: true,
            longitude: true,
            isAvailable: true,

            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },

      orderBy: {
        createdAt: "desc",
      },
    });

    res.status(200).json({
      message: "Rider pickups fetched successfully",
      pickups,
    });

  } catch (err) {
    console.error("GET RIDER PICKUPS ERROR:", err);

    res.status(500).json({
      message: "Server Error",
    });
  }
};