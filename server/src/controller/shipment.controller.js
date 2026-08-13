import prisma from "../config/prisma.js";
import QRCode from "qrcode";

function generateTrackingNumber() {
  return `RC-${Date.now()}`;
}

// ============================================================
// CREATE SHIPMENT
// ============================================================

export const createShipment = async (req, res) => {
  try {
    const {
      receiverName,
      receiverPhone,
      receiverAddress,
      packageType,
      weight,
      paymentType,
      shippingCharge,
      codAmount,
      notes,
      vendorId,
      priceLocationId,
    } = req.body;

    const trackingNumber = generateTrackingNumber();

    const qrCode = await QRCode.toDataURL(trackingNumber);

    const shipment = await prisma.$transaction(async (tx) => {
      const shipment = await tx.shipment.create({
        data: {
          trackingNumber,
          qrCode,

          receiverName,
          receiverPhone,
          receiverAddress,

          packageType,
          weight,

          paymentType,
          shippingCharge,
          codAmount,

          notes,

          vendorId,
          priceLocationId,

          status: "RECEIVED",
        },
      });

      await tx.tracking.create({
        data: {
          shipmentId: shipment.id,
          status: "RECEIVED",
          location: "Main Office",
          message: "Shipment received",
        },
      });

      return shipment;
    });

    return res.status(201).json({
      message: "Shipment created successfully",
      shipment,
    });
  } catch (err) {
    console.error("CREATE SHIPMENT ERROR:", err);

    return res.status(500).json({
      message: err.message || "Server Error",
    });
  }
};

// ============================================================
// GET ALL SHIPMENTS
// ============================================================

export const getAllShipments = async (req, res) => {
  try {
    const shipments = await prisma.shipment.findMany({
      include: {
        vendor: true,

        priceLocation: true,

        rider: {
          include: {
            user: true,
          },
        },

        trackings: {
          orderBy: {
            createdAt: "desc",
          },
        },
      },

      orderBy: {
        createdAt: "desc",
      },
    });

    return res.json(shipments);
  } catch (err) {
    console.error("GET ALL SHIPMENTS ERROR:", err);

    return res.status(500).json({
      message: err.message || "Server Error",
    });
  }
};

// ============================================================
// GET SHIPMENT BY TRACKING NUMBER
// ============================================================

export const getShipmentByTracking = async (req, res) => {
  try {
    const shipment = await prisma.shipment.findUnique({
      where: {
        trackingNumber: req.params.trackingNumber,
      },

      include: {
        vendor: true,

        priceLocation: true,

        rider: {
          include: {
            user: true,
          },
        },

        trackings: {
          orderBy: {
            createdAt: "desc",
          },
        },
      },
    });

    if (!shipment) {
      return res.status(404).json({
        message: "Shipment not found",
      });
    }

    return res.json(shipment);
  } catch (err) {
    console.error("GET SHIPMENT BY TRACKING ERROR:", err);

    return res.status(500).json({
      message: err.message || "Server Error",
    });
  }
};

// ============================================================
// GET SINGLE SHIPMENT BY ID
// ============================================================

export const getShipment = async (req, res) => {
  try {
    const { id } = req.params;

    console.log("GET SHIPMENT ID:", id);

    const shipment = await prisma.shipment.findUnique({
      where: {
        id,
      },

      include: {
        vendor: true,

        priceLocation: true,

        rider: {
          include: {
            user: true,
          },
        },

        trackings: {
          orderBy: {
            createdAt: "desc",
          },
        },
      },
    });

    if (!shipment) {
      return res.status(404).json({
        message: "Shipment not found",
      });
    }

    console.log("SHIPMENT:", shipment);
    console.log("RIDER:", shipment.rider);
    console.log("TRACKINGS:", shipment.trackings);

    return res.json(shipment);
  } catch (err) {
    console.error("GET SHIPMENT ERROR:", err);

    return res.status(500).json({
      message: err.message || "Server Error",
    });
  }
};

// ============================================================
// UPDATE SHIPMENT
// ============================================================

export const updateShipment = async (req, res) => {
  try {
    const {
      receiverName,
      receiverPhone,
      receiverAddress,
      packageType,
      weight,
      shippingCharge,
      codAmount,
      notes,
      status,
    } = req.body;

    const shipment = await prisma.shipment.update({
      where: {
        id: req.params.id,
      },

      data: {
        receiverName,
        receiverPhone,
        receiverAddress,
        packageType,
        weight,
        shippingCharge,
        codAmount,
        notes,
        status,
      },
    });

    return res.json({
      message: "Shipment updated successfully",
      shipment,
    });
  } catch (err) {
    console.error("UPDATE SHIPMENT ERROR:", err);

    return res.status(500).json({
      message: err.message || "Server Error",
    });
  }
};

// ============================================================
// UPDATE STATUS
// ============================================================

export const updateStatus = async (req, res) => {
  try {
    const { status, location, message } = req.body;

    if (!status) {
      return res.status(400).json({
        message: "Status is required",
      });
    }

    const shipment = await prisma.$transaction(async (tx) => {
      const updatedShipment = await tx.shipment.update({
        where: {
          id: req.params.id,
        },

        data: {
          status,
        },
      });

      await tx.tracking.create({
        data: {
          shipmentId: updatedShipment.id,
          status,
          location: location || null,
          message: message || null,
        },
      });

      return tx.shipment.findUnique({
        where: {
          id: updatedShipment.id,
        },

        include: {
          vendor: true,

          priceLocation: true,

          rider: {
            include: {
              user: true,
            },
          },

          trackings: {
            orderBy: {
              createdAt: "desc",
            },
          },
        },
      });
    });

    return res.json(shipment);
  } catch (err) {
    console.error("UPDATE STATUS ERROR:", err);

    return res.status(500).json({
      message: err.message || "Server Error",
    });
  }
};

// ============================================================
// DELETE SHIPMENT
// ============================================================

export const deleteShipment = async (req, res) => {
  try {
    await prisma.shipment.delete({
      where: {
        id: req.params.id,
      },
    });

    return res.json({
      message: "Shipment deleted successfully",
    });
  } catch (err) {
    console.error("DELETE SHIPMENT ERROR:", err);

    return res.status(500).json({
      message: err.message || "Server Error",
    });
  }
};

// ============================================================
// ASSIGN RIDER
// ============================================================

export const assignRider = async (req, res) => {
  try {
    const { riderId, location, message } = req.body;

    // ------------------------------------------------
    // Validate rider ID
    // ------------------------------------------------

    if (!riderId) {
      return res.status(400).json({
        message: "Rider ID is required",
      });
    }

    const numericRiderId = Number(riderId);

    if (Number.isNaN(numericRiderId)) {
      return res.status(400).json({
        message: "Invalid rider ID",
      });
    }

    const shipment = await prisma.$transaction(async (tx) => {
      // ------------------------------------------------
      // Check shipment
      // ------------------------------------------------

      const existingShipment = await tx.shipment.findUnique({
        where: {
          id: req.params.id,
        },
      });

      if (!existingShipment) {
        throw new Error("Shipment not found");
      }

      // ------------------------------------------------
      // Check rider
      // ------------------------------------------------

      const rider = await tx.rider.findUnique({
        where: {
          id: numericRiderId,
        },
      });

      if (!rider) {
        throw new Error("Rider not found");
      }

      // ------------------------------------------------
      // If another rider was already assigned,
      // make the old rider available again.
      // ------------------------------------------------

      if (
        existingShipment.rider &&
        existingShipment.rider !== numericRiderId
      ) {
        await tx.rider.update({
          where: {
            id: existingShipment.rider,
          },
          data: {
            isAvailable: true,
          },
        });
      }

      // ------------------------------------------------
      // Assign rider
      //
      // IMPORTANT:
      // We use rider.connect instead of riderId.
      // ------------------------------------------------

      const updatedShipment = await tx.shipment.update({
        where: {
          id: req.params.id,
        },

        data: {
          rider: {
            connect: {
              id: numericRiderId,
            },
          },

          status: "OUT_FOR_DELIVERY",
        },
      });

      // ------------------------------------------------
      // Add tracking event
      // ------------------------------------------------

      await tx.tracking.create({
        data: {
          shipmentId: updatedShipment.id,

          status: "OUT_FOR_DELIVERY",

          location: location || "Main Office",

          message:
            message ||
            `Shipment assigned to rider ${rider.id}`,
        },
      });

      // ------------------------------------------------
      // Make new rider unavailable
      // ------------------------------------------------

      await tx.rider.update({
        where: {
          id: numericRiderId,
        },

        data: {
          isAvailable: false,
        },
      });

      // ------------------------------------------------
      // Return complete shipment
      // ------------------------------------------------

      return tx.shipment.findUnique({
        where: {
          id: updatedShipment.id,
        },

        include: {
          vendor: true,

          priceLocation: true,

          rider: {
            include: {
              user: true,
            },
          },

          trackings: {
            orderBy: {
              createdAt: "desc",
            },
          },
        },
      });
    });

    return res.json({
      message: "Rider assigned successfully",
      shipment,
    });
  } catch (err) {
    console.error("ASSIGN RIDER ERROR:", err);

    return res.status(400).json({
      message: err.message || "Failed to assign rider",
    });
  }
};

// ============================================================
// ADD SHIPMENT MESSAGE
// ============================================================

export const addShipmentMessage = async (req, res) => {
  try {
    const { message, location } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        message: "Message is required",
      });
    }

    const shipment = await prisma.shipment.findUnique({
      where: {
        id: req.params.id,
      },
    });

    if (!shipment) {
      return res.status(404).json({
        message: "Shipment not found",
      });
    }

    const tracking = await prisma.tracking.create({
      data: {
        shipmentId: shipment.id,

        status: shipment.status,

        location: location || "Rider Location",

        message: message.trim(),
      },
    });

    return res.status(201).json({
      message: "Delivery message added successfully",
      tracking,
    });
  } catch (err) {
    console.error("ADD SHIPMENT MESSAGE ERROR:", err);

    return res.status(500).json({
      message: err.message || "Server Error",
    });
  }
};