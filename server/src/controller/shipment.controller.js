import prisma from "../config/prisma.js";
import QRCode from "qrcode";



import {
  generateTrackingNumber,
} from "../utils/generateTrackingNumber.js";

export const createShipment = async (req, res) => {
  try {
    // ====================================================
    // AUTH USER
    // ====================================================

    const user = req.user;

    if (!user) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    // ====================================================
    // BODY
    // ====================================================

    const {
      receiverName,
      receiverPhone,
      receiverAddress,
      packageType,
      weight,
      paymentType,
      codAmount,
      notes,
      locationRateId,
    } = req.body;

    // ====================================================
    // VALIDATION
    // ====================================================

    if (!receiverName || !receiverName.trim()) {
      return res.status(400).json({
        message: "Receiver name is required",
      });
    }

    if (!receiverPhone || !receiverPhone.trim()) {
      return res.status(400).json({
        message: "Receiver phone is required",
      });
    }

    if (!receiverAddress || !receiverAddress.trim()) {
      return res.status(400).json({
        message: "Receiver address is required",
      });
    }

    if (!packageType) {
      return res.status(400).json({
        message: "Package type is required",
      });
    }

    const finalWeight = Number(weight);

    if (
      weight === undefined ||
      weight === null ||
      Number.isNaN(finalWeight) ||
      finalWeight <= 0
    ) {
      return res.status(400).json({
        message: "Weight must be greater than 0",
      });
    }

    if (!paymentType) {
      return res.status(400).json({
        message: "Payment type is required",
      });
    }

    if (!["PREPAID", "COD"].includes(paymentType)) {
      return res.status(400).json({
        message: "Payment type must be PREPAID or COD",
      });
    }

    if (!locationRateId) {
      return res.status(400).json({
        message: "Location and delivery type are required",
      });
    }

    // ====================================================
    // COD
    // ====================================================

    const finalCodAmount =
      paymentType === "COD"
        ? Number(codAmount || 0)
        : 0;

    if (
      paymentType === "COD" &&
      finalCodAmount <= 0
    ) {
      return res.status(400).json({
        message: "Valid COD amount is required",
      });
    }

    // ====================================================
    // GET LOCATION RATE
    // ====================================================

    const locationRate =
      await prisma.locationRate.findUnique({
        where: {
          id: Number(locationRateId),
        },
        include: {
          location: true,
          deliveryType: true,
        },
      });

    if (!locationRate) {
      return res.status(404).json({
        message: "Location rate not found",
      });
    }

    // ====================================================
    // CALCULATE SHIPPING
    //
    // Example:
    // Rs. 200 x 1kg = Rs. 200
    // Rs. 200 x 2kg = Rs. 400
    // Rs. 200 x 3kg = Rs. 600
    // ====================================================

    const shippingCharge =
      Number(locationRate.price) * finalWeight;

    // ====================================================
    // DETERMINE ORIGIN
    // ====================================================

    let origin;

    let vendorId = null;

    let createdByStaffId = null;

    // ====================================================
    // VENDOR
    // ====================================================

    if (user.role === "VENDOR") {
      origin = "VENDOR";

      if (!user.vendor) {
        return res.status(400).json({
          message: "Vendor profile not found",
        });
      }

      vendorId = user.vendor.id;
    }

    // ====================================================
    // STAFF / ADMIN
    // ====================================================

    else if (
      user.role === "STAFF" ||
      user.role === "ADMIN"
    ) {
      origin = "STAFF";

      if (!user.staff) {
        return res.status(400).json({
          message: "Staff profile not found",
        });
      }

      createdByStaffId = user.staff.id;
    }

    // ====================================================
    // OTHER ROLE
    // ====================================================

    else {
      return res.status(403).json({
        message:
          "You are not allowed to create shipments",
      });
    }

    // ====================================================
    // TRACKING NUMBER
    // ====================================================

    const trackingNumber =
      generateTrackingNumber();

    // ====================================================
    // QR CODE
    // ====================================================

    const qrCode =
      await QRCode.toDataURL(
        trackingNumber
      );

    // ====================================================
    // TRANSACTION
    // ====================================================

    const shipment =
      await prisma.$transaction(
        async (tx) => {

          // ----------------------------------------------
          // CREATE SHIPMENT
          // ----------------------------------------------

          const newShipment =
            await tx.shipment.create({
              data: {
                trackingNumber,
                qrCode,

                receiverName:
                  receiverName.trim(),

                receiverPhone:
                  receiverPhone.trim(),

                receiverAddress:
                  receiverAddress.trim(),

                packageType,

                weight: finalWeight,

                paymentType,

                codAmount:
                  finalCodAmount,

                shippingCharge,

                notes:
                  notes
                    ? notes.trim()
                    : null,

                origin,

                deliveryZone:
                  locationRate.location.zone,

                status: "CREATED",

                vendorId,

                createdByStaffId,

                locationRateId:
                  Number(locationRateId),
              },
            });

          // ----------------------------------------------
          // TRACKING
          // ----------------------------------------------

          await tx.tracking.create({
            data: {
              shipmentId:
                newShipment.id,

              status: "CREATED",

              location:
                locationRate.location.name,

              message:
                "Shipment created successfully",

              createdBy:
                user.name,
            },
          });

          return newShipment;
        },
        {
          timeout: 10000,
        }
      );

    // ====================================================
    // NOTIFICATION
    //
    // IMPORTANT:
    // Outside transaction
    // ====================================================

    try {
      await prisma.notification.create({
        data: {
          shipmentId: shipment.id,

          title: "Shipment Created",

          message:
            `Shipment ${trackingNumber} has been created successfully.`,

          isRead: false,
        },
      });
    } catch (notificationError) {
      console.error(
        "NOTIFICATION CREATE ERROR:",
        notificationError
      );

      // Don't fail shipment creation
    }

    // ====================================================
    // RESPONSE
    // ====================================================

    return res.status(201).json({
      message:
        "Shipment created successfully",

      shipment: {
        id: shipment.id,

        trackingNumber:
          shipment.trackingNumber,

        receiverName:
          shipment.receiverName,

        receiverPhone:
          shipment.receiverPhone,

        receiverAddress:
          shipment.receiverAddress,

        packageType:
          shipment.packageType,

        weight:
          shipment.weight,

        paymentType:
          shipment.paymentType,

        codAmount:
          shipment.codAmount,

        shippingCharge:
          shipment.shippingCharge,

        origin:
          shipment.origin,

        deliveryZone:
          shipment.deliveryZone,

        status:
          shipment.status,

        locationRate: {
          id: locationRate.id,

          price: locationRate.price,

          location: {
            id:
              locationRate.location.id,

            name:
              locationRate.location.name,

            zone:
              locationRate.location.zone,
          },

          deliveryType: {
            id:
              locationRate.deliveryType.id,

            name:
              locationRate.deliveryType.name,
          },
        },

        qrCode:
          shipment.qrCode,

        createdAt:
          shipment.createdAt,
      },
    });

  } catch (error) {
    console.error(
      "CREATE SHIPMENT ERROR:",
      error
    );

    return res.status(500).json({
      message:
        error.message ||
        "Failed to create shipment",
    });
  }
};
// ============================================================
// GET MY SHIPMENTS
// ============================================================






// ============================================================
// GET MY SHIPMENTS
// Vendor POV
// ============================================================

export const getMyShipments = async (req, res) => {
  try {
    // ---------------------------------------------
    // USER FROM JWT
    // ---------------------------------------------

    const user = req.user;

    if (!user) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    // ---------------------------------------------
    // ONLY VENDOR
    // ---------------------------------------------

    if (user.role !== "VENDOR") {
      return res.status(403).json({
        message: "Only vendors can access their shipments",
      });
    }

    // ---------------------------------------------
    // CHECK VENDOR PROFILE
    // ---------------------------------------------

    if (!user.vendor) {
      return res.status(400).json({
        message: "Vendor profile not found",
      });
    }

    const vendorId = user.vendor.id;

    // ---------------------------------------------
    // GET SHIPMENTS
    // ---------------------------------------------

    const shipments = await prisma.shipment.findMany({
      where: {
        vendorId: vendorId,
      },

      include: {
        vendor: {
          include: {
            user: true,
          },
        },

        locationRate: {
          include: {
            location: true,
            deliveryType: true,
          },
        },

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

    // ---------------------------------------------
    // RESPONSE
    // ---------------------------------------------

    return res.status(200).json({
      shipments,
    });

  } catch (error) {
    console.error(
      "GET MY SHIPMENTS ERROR:",
      error
    );

    return res.status(500).json({
      message:
        error.message ||
        "Failed to get your shipments",
    });
  }
};




export const getAllShipments = async (req, res) => {
  try {
    const shipments = await prisma.shipment.findMany({
      include: {
        vendor: {
          include: {
            user: true,
          },
        },

        createdByStaff: {
          include: {
            user: true,
          },
        },

        locationRate: {
          include: {
            location: true,
            deliveryType: true,
          },
        },

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

        notifications: true,
      },

      orderBy: {
        createdAt: "desc",
      },
    });

    return res.status(200).json({
      shipments,
    });
  } catch (err) {
    console.error("GET ALL SHIPMENTS ERROR:", err);

    return res.status(500).json({
      message: err.message || "Server Error",
    });
  }
};

export const getMyRiderShipments = async (req, res) => {
  try {
    // req.user.id should come from your authentication middleware
    const userId = req.user.id;

    const rider = await prisma.rider.findUnique({
      where: {
        userId: Number(userId),
      },
    });

    if (!rider) {
      return res.status(404).json({
        message: "Rider profile not found",
      });
    }

    const shipments = await prisma.shipment.findMany({
      where: {
        riderId: rider.id,
      },

      include: {
        vendor: {
          include: {
            user: true,
          },
        },

        createdByStaff: {
          include: {
            user: true,
          },
        },

        locationRate: {
          include: {
            location: true,
            deliveryType: true,
          },
        },

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

        notifications: true,
      },

      orderBy: {
        createdAt: "desc",
      },
    });

    return res.status(200).json({
      shipments,
    });
  } catch (err) {
    console.error("GET MY RIDER SHIPMENTS ERROR:", err);

    return res.status(500).json({
      message: err.message || "Server Error",
    });
  }
};

export const getShipmentByTracking = async (req, res) => {
  try {
    const shipment = await prisma.shipment.findUnique({
      where: {
        trackingNumber: req.params.trackingNumber,
      },

      include: {
        vendor: {
          include: {
            user: true,
          },
        },

        createdByStaff: {
          include: {
            user: true,
          },
        },

        locationRate: {
          include: {
            location: true,
            deliveryType: true,
          },
        },

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

        notifications: true,
      },
    });

    if (!shipment) {
      return res.status(404).json({
        message: "Shipment not found",
      });
    }

    return res.status(200).json(shipment);
  } catch (err) {
    console.error(
      "GET SHIPMENT BY TRACKING ERROR:",
      err
    );

    return res.status(500).json({
      message: err.message || "Server Error",
    });
  }
};
export const getShipment = async (req, res) => {
  try {
    const { id } = req.params;

    const shipment = await prisma.shipment.findUnique({
      where: {
        id,
      },

      include: {
        vendor: {
          include: {
            user: true,
          },
        },

        createdByStaff: {
          include: {
            user: true,
          },
        },

        locationRate: {
          include: {
            location: true,
            deliveryType: true,
          },
        },

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

        notifications: true,
      },
    });

    if (!shipment) {
      return res.status(404).json({
        message: "Shipment not found",
      });
    }

    return res.status(200).json(shipment);
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
// UPDATE SHIPMENT STATUS
// ============================================================

export const updateStatus = async (req, res) => {
  try {
    const { status, location, message } = req.body;

    // ============================================================
    // VALIDATE STATUS
    // ============================================================
const allowedStatuses = [
  "CREATED",
  "IN_WAREHOUSE",
  "ASSIGNED_TO_RIDER",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "RETURNED",
  "CANCELLED",
];

    if (!status) {
      return res.status(400).json({
        message: "Status is required",
      });
    }

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        message: "Invalid shipment status",
        allowedStatuses,
      });
    }

    // ============================================================
    // CHECK SHIPMENT FIRST
    // ============================================================

    const existingShipment =
      await prisma.shipment.findUnique({
        where: {
          id: req.params.id,
        },
      });

    if (!existingShipment) {
      return res.status(404).json({
        message: "Shipment not found",
      });
    }

    // ============================================================
    // UPDATE STATUS + TRACKING
    // ============================================================

    await prisma.$transaction(
      async (tx) => {
        // --------------------------------------------------------
        // UPDATE SHIPMENT
        // --------------------------------------------------------

        await tx.shipment.update({
          where: {
            id: req.params.id,
          },

          data: {
            status,
          },
        });

        // --------------------------------------------------------
        // CREATE TRACKING HISTORY
        // --------------------------------------------------------

        await tx.tracking.create({
          data: {
            shipmentId: existingShipment.id,

            status,

            location:
              location?.trim() || "Main Office",

            message:
              message?.trim() ||
              `Shipment status changed to ${status}`,
          },
        });
      },
      {
        timeout: 10000,
      }
    );

    // ============================================================
    // GET UPDATED SHIPMENT
    //
    // IMPORTANT:
    // This happens AFTER the transaction has finished.
    // ============================================================

    const shipment =
      await prisma.shipment.findUnique({
        where: {
          id: req.params.id,
        },

        include: {
          vendor: {
            include: {
              user: true,
            },
          },

          createdByStaff: {
            include: {
              user: true,
            },
          },

          locationRate: {
            include: {
              location: true,
              deliveryType: true,
            },
          },

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

          notifications: true,
        },
      });

    // ============================================================
    // RESPONSE
    // ============================================================

    return res.status(200).json({
      message: "Shipment status updated successfully",
      shipment,
    });

  } catch (err) {
    console.error(
      "UPDATE STATUS ERROR:",
      err
    );

    return res.status(500).json({
      message:
        err.message ||
        "Failed to update shipment status",
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

export const assignRider = async (req, res) => {
  try {
    const shipmentId = req.params.id;
    const { riderId } = req.body;

    if (!riderId) {
      return res.status(400).json({
        message: "Rider ID is required",
      });
    }

    const shipment = await prisma.shipment.findUnique({
      where: {
        id: shipmentId,
      },
    });

    if (!shipment) {
      return res.status(404).json({
        message: "Shipment not found",
      });
    }

    const rider = await prisma.rider.findUnique({
      where: {
        id: Number(riderId),
      },
      include: {
        user: true,
      },
    });

    if (!rider) {
      return res.status(404).json({
        message: "Rider not found",
      });
    }

    if (!rider.isAvailable) {
      return res.status(400).json({
        message: "Rider is not available",
      });
    }

    const updatedShipment = await prisma.shipment.update({
      where: {
        id: shipmentId,
      },
      data: {
        riderId: rider.id,
      },
      include: {
        rider: {
          include: {
            user: true,
          },
        },
      },
    });

    return res.json({
      message: "Rider assigned successfully",
      shipment: updatedShipment,
    });

  } catch (err) {
    console.error("ASSIGN RIDER ERROR:", err);

    return res.status(500).json({
      message: "Server Error",
      error: err.message,
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
