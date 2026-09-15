import prisma from "../config/prisma.js";
import QRCode from "qrcode";

import {
  generateTrackingNumber,
} from "../utils/generateTrackingNumber.js";

// ============================================================
// HELPERS
// ============================================================

const getUserRole = (req) => {
  return String(req.user?.role || "").toUpperCase();
};

// ============================================================
// GET AUTHENTICATED VENDOR
// ============================================================

const getAuthenticatedVendor = async (req) => {
  if (req.user?.vendor?.id) {
    return Number(req.user.vendor.id);
  }

  if (req.user?.vendorId) {
    return Number(req.user.vendorId);
  }

  if (req.user?.id) {
    const vendor = await prisma.vendor.findUnique({
      where: {
        userId: Number(req.user.id),
      },

      select: {
        id: true,
      },
    });

    return vendor?.id ?? null;
  }

  return null;
};

// ============================================================
// GET AUTHENTICATED STAFF
// ============================================================

const getAuthenticatedStaff = async (req) => {
  if (req.user?.staff?.id) {
    return Number(req.user.staff.id);
  }

  if (req.user?.staffId) {
    return Number(req.user.staffId);
  }

  if (req.user?.id) {
    const staff = await prisma.staff.findUnique({
      where: {
        userId: Number(req.user.id),
      },

      select: {
        id: true,
      },
    });

    return staff?.id ?? null;
  }

  return null;
};

// ============================================================
// NORMALIZE ENUM
// ============================================================

const normalizeUpper = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().toUpperCase();
};

// ============================================================
// COMMON SHIPMENT INCLUDE
// ============================================================

const shipmentInclude = {
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

  codCollection: true,

  accountingEntries: true,

  trackings: {
    orderBy: {
      createdAt: "desc",
    },
  },

  notifications: true,
};

// ============================================================
// CREATE SHIPMENT
//
// POST /api/shipment
//
// VENDOR:
//   vendorId is automatically taken from authenticated vendor.
//
// STAFF / ADMIN:
//   vendorId can be supplied.
//   If vendorId is missing/null => WALK-IN shipment.
//
// REGISTERED VENDOR:
//   sender data comes from Vendor snapshot.
//
// WALK-IN:
//   sender data comes from request body.
// ============================================================

export const createShipment = async (req, res) => {
  try {
    // ========================================================
    // AUTH
    // ========================================================

    const role = getUserRole(req);

    if (!role) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized.",
      });
    }

    if (!["VENDOR", "STAFF", "ADMIN"].includes(role)) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to create shipments.",
      });
    }

    // ========================================================
    // BODY
    // ========================================================

    const {
      vendorId,

      senderName,
      senderPhone,
      senderAddress,

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

    // ========================================================
    // NORMALIZE
    // ========================================================

    const normalizedPackageType =
      normalizeUpper(packageType);

    const normalizedPaymentType =
      normalizeUpper(paymentType);

    // ========================================================
    // RECEIVER VALIDATION
    // ========================================================

    if (!String(receiverName || "").trim()) {
      return res.status(400).json({
        success: false,
        message: "Receiver name is required.",
      });
    }

    if (!String(receiverPhone || "").trim()) {
      return res.status(400).json({
        success: false,
        message: "Receiver phone is required.",
      });
    }

    if (!String(receiverAddress || "").trim()) {
      return res.status(400).json({
        success: false,
        message: "Receiver address is required.",
      });
    }

    // ========================================================
    // PACKAGE TYPE
    // ========================================================

    const validPackageTypes = [
      "DOCUMENT",
      "PARCEL",
      "BOX",
      "ELECTRONICS",
      "CLOTHING",
      "FOOD",
      "FRAGILE",
      "OTHER",
    ];

    if (!validPackageTypes.includes(normalizedPackageType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid package type.",
      });
    }

    // ========================================================
    // WEIGHT
    // ========================================================

    const finalWeight = Number(weight);

    if (!Number.isFinite(finalWeight) || finalWeight <= 0) {
      return res.status(400).json({
        success: false,
        message: "Weight must be greater than 0.",
      });
    }

    // ========================================================
    // PAYMENT
    // ========================================================

    if (!["PREPAID", "COD"].includes(normalizedPaymentType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment type.",
      });
    }

    // ========================================================
    // COD
    // ========================================================

    let finalCodAmount = 0;

    if (normalizedPaymentType === "COD") {
      finalCodAmount = Number(codAmount);

      if (
        !Number.isFinite(finalCodAmount) ||
        finalCodAmount <= 0
      ) {
        return res.status(400).json({
          success: false,
          message: "COD amount must be greater than 0.",
        });
      }
    }

    // PREPAID always has zero COD.
    if (normalizedPaymentType === "PREPAID") {
      finalCodAmount = 0;
    }

    // ========================================================
    // LOCATION RATE
    // ========================================================

    const finalLocationRateId = Number(locationRateId);

    if (
      !Number.isInteger(finalLocationRateId) ||
      finalLocationRateId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid location rate is required.",
      });
    }

    const locationRate =
      await prisma.locationRate.findUnique({
        where: {
          id: finalLocationRateId,
        },

        include: {
          location: true,
          deliveryType: true,
        },
      });

    if (!locationRate) {
      return res.status(404).json({
        success: false,
        message: "Location rate not found.",
      });
    }

    // ========================================================
    // SHIPPING CHARGE
    // ========================================================

    const ratePerKg = Number(locationRate.price);

    const shippingCharge =
      ratePerKg * finalWeight;

    if (
      !Number.isFinite(shippingCharge) ||
      shippingCharge < 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid shipping charge.",
      });
    }

    // ========================================================
    // DELIVERY ZONE
    // ========================================================

    const deliveryZone =
      locationRate.location.zone;

    // ========================================================
    // DETERMINE ORIGIN
    // ========================================================

    let finalOrigin;

    if (role === "VENDOR") {
      finalOrigin = "VENDOR";
    } else {
      finalOrigin = "STAFF";
    }

    // ========================================================
    // VENDOR / STAFF IDS
    // ========================================================

    let finalVendorId = null;
    let finalCreatedByStaffId = null;

    // ========================================================
    // VENDOR CREATES SHIPMENT
    // ========================================================

    if (role === "VENDOR") {
      const authenticatedVendorId =
        await getAuthenticatedVendor(req);

      if (!authenticatedVendorId) {
        return res.status(403).json({
          success: false,
          message: "Vendor profile not found.",
        });
      }

      finalVendorId =
        authenticatedVendorId;
    }

    // ========================================================
    // STAFF / ADMIN CREATES SHIPMENT
    // ========================================================

    if (role === "STAFF" || role === "ADMIN") {
      // ------------------------------------------------------
      // REGISTERED VENDOR
      // ------------------------------------------------------

      if (
        vendorId !== null &&
        vendorId !== undefined &&
        vendorId !== "" &&
        Number(vendorId) > 0
      ) {
        finalVendorId = Number(vendorId);
      }

      // ------------------------------------------------------
      // STAFF PROFILE
      // ------------------------------------------------------

      if (role === "STAFF") {
        const staffId =
          await getAuthenticatedStaff(req);

        if (!staffId) {
          return res.status(403).json({
            success: false,
            message: "Staff profile not found.",
          });
        }

        finalCreatedByStaffId = staffId;
      }

      // ADMIN can create walk-in or vendor shipment.
      if (role === "ADMIN") {
        finalCreatedByStaffId = null;
      }
    }

    // ========================================================
    // REGISTERED VENDOR
    // ========================================================

    let vendor = null;

    if (finalVendorId) {
      vendor =
        await prisma.vendor.findUnique({
          where: {
            id: finalVendorId,
          },

          select: {
            id: true,
            companyName: true,
            contactId: true,
            location: true,
          },
        });

      if (!vendor) {
        return res.status(404).json({
          success: false,
          message: "Selected vendor not found.",
        });
      }
    }

    // ========================================================
    // WALK-IN SENDER VALIDATION
    // ========================================================

    if (!finalVendorId) {
      if (!String(senderName || "").trim()) {
        return res.status(400).json({
          success: false,
          message:
            "Sender name is required for an unregistered shipment.",
        });
      }

      if (!String(senderPhone || "").trim()) {
        return res.status(400).json({
          success: false,
          message:
            "Sender phone is required for an unregistered shipment.",
        });
      }

      if (!String(senderAddress || "").trim()) {
        return res.status(400).json({
          success: false,
          message:
            "Sender address is required for an unregistered shipment.",
        });
      }
    }

    // ========================================================
    // SENDER SNAPSHOT
    // ========================================================

    let finalSenderName = String(
      senderName || ""
    ).trim();

    let finalSenderPhone = String(
      senderPhone || ""
    ).trim();

    let finalSenderAddress = String(
      senderAddress || ""
    ).trim();

    // Registered vendor sender information is ALWAYS
    // taken from the vendor profile.
    if (vendor) {
      finalSenderName =
        String(vendor.companyName || "").trim();

      finalSenderPhone =
        String(vendor.contactId || "").trim();

      finalSenderAddress =
        String(vendor.location || "").trim();

      if (
        !finalSenderName ||
        !finalSenderPhone ||
        !finalSenderAddress
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Vendor profile is missing company name, phone, or address.",
        });
      }
    }

    // ========================================================
    // TRACKING NUMBER
    // ========================================================

    const trackingNumber =
      await generateTrackingNumber();

    // ========================================================
    // QR CODE
    // ========================================================

    const frontendUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.FRONTEND_URL ||
      "http://localhost:3000";

    const trackingUrl =
      `${frontendUrl}/track/${trackingNumber}`;

    const qrCode =
      await QRCode.toDataURL(trackingUrl);

    // ========================================================
    // INITIAL TRACKING
    // ========================================================

    const trackingLocation =
      locationRate.location.name;

    // ========================================================
    // TRANSACTION
    // ========================================================

    const result =
      await prisma.$transaction(
        async (tx) => {
          // ==================================================
          // CREATE SHIPMENT
          // ==================================================

          const shipment =
            await tx.shipment.create({
              data: {
                trackingNumber,

                // -----------------------------
                // SENDER
                // -----------------------------

                senderName:
                  finalSenderName,

                senderPhone:
                  finalSenderPhone,

                senderAddress:
                  finalSenderAddress,

                // -----------------------------
                // RECEIVER
                // -----------------------------

                receiverName:
                  String(receiverName).trim(),

                receiverPhone:
                  String(receiverPhone).trim(),

                receiverAddress:
                  String(receiverAddress).trim(),

                // -----------------------------
                // PACKAGE
                // -----------------------------

                packageType:
                  normalizedPackageType,

                weight:
                  finalWeight,

                // -----------------------------
                // PAYMENT
                // -----------------------------

                paymentType:
                  normalizedPaymentType,

                codAmount:
                  finalCodAmount,

                // -----------------------------
                // CHARGE
                // -----------------------------

                shippingCharge:
                  shippingCharge,

                // -----------------------------
                // OTHER
                // -----------------------------

                notes:
                  String(notes || "").trim() || null,

                qrCode,

                origin:
                  finalOrigin,

                deliveryZone,

                status:
                  "CREATED",

                // -----------------------------
                // RELATIONS
                // -----------------------------

                vendorId:
                  finalVendorId,

                createdByStaffId:
                  finalCreatedByStaffId,

                locationRateId:
                  finalLocationRateId,
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

                createdByStaff: {
                  select: {
                    id: true,
                    phone: true,
                  },
                },

                locationRate: {
                  include: {
                    location: true,
                    deliveryType: true,
                  },
                },
              },
            });

          // ==================================================
          // TRACKING
          // ==================================================

          await tx.tracking.create({
            data: {
              shipmentId:
                shipment.id,

              status:
                "CREATED",

              location:
                trackingLocation,

              message:
                "Shipment has been created successfully.",

              createdBy:
                String(req.user?.id || role),
            },
          });

          // ==================================================
          // COD COLLECTION
          // ==================================================

          if (
            normalizedPaymentType === "COD" &&
            finalCodAmount > 0
          ) {
            await tx.codCollection.create({
              data: {
                shipmentId:
                  shipment.id,

                amount:
                  finalCodAmount,

                status:
                  "PENDING",
              },
            });
          }

          // ==================================================
          // ACCOUNTING
          //
          // ONLY registered vendors.
          //
          // Walk-in shipment:
          // vendorId = null
          // therefore NO vendor accounting entry.
          // ==================================================

          if (
            finalVendorId &&
            shippingCharge > 0
          ) {
            await tx.accountingEntry.create({
              data: {
                vendorId:
                  finalVendorId,

                shipmentId:
                  shipment.id,

                type:
                  "SHIPPING_CHARGE",

                direction:
                  "DEBIT",

                amount:
                  shippingCharge,

                description:
                  `Shipping charge for shipment ${trackingNumber}`,
              },
            });
          }

          return shipment;
        },

        {
          timeout: 15000,
          maxWait: 10000,
        }
      );

    // ========================================================
    // NOTIFICATION
    // ========================================================

    try {
      await prisma.notification.create({
        data: {
          shipmentId:
            result.id,

          title:
            "Shipment Created",

          message:
            `Shipment ${result.trackingNumber} has been created successfully.`,
        },
      });
    } catch (notificationError) {
      console.error(
        "CREATE SHIPMENT NOTIFICATION ERROR:",
        notificationError
      );
    }

    // ========================================================
    // RESPONSE
    // ========================================================

    return res.status(201).json({
      success: true,

      message:
        finalVendorId
          ? "Registered vendor shipment created successfully."
          : "Unregistered customer shipment created successfully.",

      shipment: result,
    });
  } catch (error) {
    console.error(
      "CREATE SHIPMENT ERROR:",
      error
    );

    // ========================================================
    // UNIQUE
    // ========================================================

    if (error?.code === "P2002") {
      return res.status(409).json({
        success: false,
        message:
          "A shipment with this unique information already exists. Please try again.",
      });
    }

    // ========================================================
    // FOREIGN KEY
    // ========================================================

    if (error?.code === "P2003") {
      return res.status(400).json({
        success: false,
        message:
          "Invalid vendor, staff, location rate, or related shipment information.",
      });
    }

    return res.status(500).json({
      success: false,
      message:
        "Failed to create shipment.",

      error:
        process.env.NODE_ENV === "development"
          ? error?.message
          : undefined,
    });
  }
};

// ============================================================
// GET MY SHIPMENTS
//
// GET /api/shipment/my
// ============================================================

export const getMyShipments = async (req, res) => {
  try {
    const role = getUserRole(req);

    if (!req.user) {
      return res.status(401).json({
        message: "Authentication required.",
      });
    }

    if (role !== "VENDOR") {
      return res.status(403).json({
        message:
          "Only vendors can access their shipments.",
      });
    }

    const vendorId =
      await getAuthenticatedVendor(req);

    if (!vendorId) {
      return res.status(400).json({
        message:
          "Vendor profile not found.",
      });
    }

    const shipments =
      await prisma.shipment.findMany({
        where: {
          vendorId,
        },

        include:
          shipmentInclude,

        orderBy: {
          createdAt: "desc",
        },
      });

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
        error?.message ||
        "Failed to get your shipments.",
    });
  }
};

// ============================================================
// GET ALL SHIPMENTS
//
// GET /api/shipment/all
// ============================================================

export const getAllShipments = async (req, res) => {
  try {
    const role = getUserRole(req);

    if (
      role !== "ADMIN" &&
      role !== "STAFF"
    ) {
      return res.status(403).json({
        message:
          "Only admin and staff can access all shipments.",
      });
    }

    const shipments =
      await prisma.shipment.findMany({
        include:
          shipmentInclude,

        orderBy: {
          createdAt: "desc",
        },
      });

    return res.status(200).json({
      shipments,
    });
  } catch (error) {
    console.error(
      "GET ALL SHIPMENTS ERROR:",
      error
    );

    return res.status(500).json({
      message:
        error?.message ||
        "Failed to get shipments.",
    });
  }
};

// ============================================================
// GET RIDER SHIPMENTS
//
// GET /api/shipment/rider/my
// ============================================================

export const getMyRiderShipments = async (
  req,
  res
) => {
  try {
    const role = getUserRole(req);

    if (role !== "RIDER") {
      return res.status(403).json({
        message:
          "Only riders can access rider shipments.",
      });
    }

    const riderId = await (async () => {
      if (req.user?.rider?.id) {
        return Number(req.user.rider.id);
      }

      if (req.user?.riderId) {
        return Number(req.user.riderId);
      }

      if (req.user?.id) {
        const rider =
          await prisma.rider.findUnique({
            where: {
              userId: Number(req.user.id),
            },

            select: {
              id: true,
            },
          });

        return rider?.id ?? null;
      }

      return null;
    })();

    if (!riderId) {
      return res.status(404).json({
        message:
          "Rider profile not found.",
      });
    }

    const shipments =
      await prisma.shipment.findMany({
        where: {
          riderId,
        },

        include:
          shipmentInclude,

        orderBy: {
          createdAt: "desc",
        },
      });

    return res.status(200).json({
      shipments,
    });
  } catch (error) {
    console.error(
      "GET MY RIDER SHIPMENTS ERROR:",
      error
    );

    return res.status(500).json({
      message:
        error?.message ||
        "Failed to get rider shipments.",
    });
  }
};

// ============================================================
// GET SHIPMENT BY TRACKING NUMBER
//
// GET /api/shipment/track/:trackingNumber
// ============================================================

export const getShipmentByTracking =
  async (req, res) => {
    try {
      const trackingNumber =
        String(
          req.params.trackingNumber || ""
        ).trim();

      if (!trackingNumber) {
        return res.status(400).json({
          message:
            "Tracking number is required.",
        });
      }

      const shipment =
        await prisma.shipment.findUnique({
          where: {
            trackingNumber,
          },

          include:
            shipmentInclude,
        });

      if (!shipment) {
        return res.status(404).json({
          message:
            "Shipment not found.",
        });
      }

      return res.status(200).json(
        shipment
      );
    } catch (error) {
      console.error(
        "GET SHIPMENT BY TRACKING ERROR:",
        error
      );

      return res.status(500).json({
        message:
          error?.message ||
          "Failed to get shipment.",
      });
    }
  };

// ============================================================
// GET SINGLE SHIPMENT
//
// GET /api/shipment/:id
// ============================================================

export const getShipment = async (
  req,
  res
) => {
  try {
    const shipment =
      await prisma.shipment.findUnique({
        where: {
          id:
            String(req.params.id),
        },

        include:
          shipmentInclude,
      });

    if (!shipment) {
      return res.status(404).json({
        message:
          "Shipment not found.",
      });
    }

    return res.status(200).json(
      shipment
    );
  } catch (error) {
    console.error(
      "GET SHIPMENT ERROR:",
      error
    );

    return res.status(500).json({
      message:
        error?.message ||
        "Failed to get shipment.",
    });
  }
};

// ============================================================
// UPDATE SHIPMENT
//
// PATCH /api/shipment/:id
// ============================================================

export const updateShipment =
  async (req, res) => {
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

      const shipment =
        await prisma.shipment.update({
          where: {
            id:
              String(req.params.id),
          },

          data: {
            ...(receiverName !== undefined && {
              receiverName:
                String(receiverName).trim(),
            }),

            ...(receiverPhone !== undefined && {
              receiverPhone:
                String(receiverPhone).trim(),
            }),

            ...(receiverAddress !== undefined && {
              receiverAddress:
                String(receiverAddress).trim(),
            }),

            ...(packageType !== undefined && {
              packageType:
                normalizeUpper(packageType),
            }),

            ...(weight !== undefined && {
              weight:
                Number(weight),
            }),

            ...(shippingCharge !== undefined && {
              shippingCharge:
                Number(shippingCharge),
            }),

            ...(codAmount !== undefined && {
              codAmount:
                Number(codAmount),
            }),

            ...(notes !== undefined && {
              notes:
                String(notes || "").trim() || null,
            }),

            ...(status !== undefined && {
              status:
                normalizeUpper(status),
            }),
          },

          include:
            shipmentInclude,
        });

      return res.status(200).json({
        message:
          "Shipment updated successfully.",

        shipment,
      });
    } catch (error) {
      console.error(
        "UPDATE SHIPMENT ERROR:",
        error
      );

      return res.status(500).json({
        message:
          error?.message ||
          "Failed to update shipment.",
      });
    }
  };

// ============================================================
// UPDATE SHIPMENT STATUS
//
// PATCH /api/shipment/:id/status
// ============================================================

export const updateStatus = async (
  req,
  res
) => {
  try {
    const shipmentId =
      String(req.params.id);

    const {
      status,
      location,
      message,
    } = req.body;

    const role = getUserRole(req);

    if (
      ![
        "ADMIN",
        "STAFF",
        "RIDER",
      ].includes(role)
    ) {
      return res.status(403).json({
        message:
          "You are not allowed to update shipment status.",
      });
    }

    const allowedStatuses = [
      "CREATED",
      "IN_WAREHOUSE",
      "ASSIGNED_TO_RIDER",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
      "RETURN_REQUESTED",
      "RETURN_ASSIGNED_TO_RIDER",
      "RETURN_PICKED_UP_FROM_CUSTOMER",
      "RETURN_IN_WAREHOUSE",
      "OUT_FOR_RETURN",
      "RETURNED_TO_VENDOR",
      "CANCELLED",
    ];

    if (!status) {
      return res.status(400).json({
        message:
          "Status is required.",
      });
    }

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        message:
          "Invalid shipment status.",
        allowedStatuses,
      });
    }

    const existingShipment =
      await prisma.shipment.findUnique({
        where: {
          id: shipmentId,
        },

        include: {
          vendor: true,
          codCollection: true,
        },
      });

    if (!existingShipment) {
      return res.status(404).json({
        message:
          "Shipment not found.",
      });
    }

    await prisma.$transaction(
      async (tx) => {
        // ==================================================
        // UPDATE SHIPMENT
        // ==================================================

        await tx.shipment.update({
          where: {
            id:
              shipmentId,
          },

          data: {
            status,
          },
        });

        // ==================================================
        // TRACKING
        // ==================================================

        await tx.tracking.create({
          data: {
            shipmentId:
              existingShipment.id,

            status,

            location:
              String(location || "").trim() ||
              "Main Office",

            message:
              String(message || "").trim() ||
              `Shipment status changed to ${status}`,
          },
        });

        // ==================================================
        // COD
        // ==================================================

        if (
          status === "DELIVERED" &&
          existingShipment.paymentType === "COD" &&
          Number(existingShipment.codAmount) > 0 &&
          existingShipment.vendorId
        ) {
          // ------------------------------------------------
          // COLLECTION
          // ------------------------------------------------

          const existingCollection =
            await tx.codCollection.findUnique({
              where: {
                shipmentId:
                  existingShipment.id,
              },
            });

          if (!existingCollection) {
            await tx.codCollection.create({
              data: {
                shipmentId:
                  existingShipment.id,

                amount:
                  existingShipment.codAmount,

                status:
                  "COLLECTED",

                collectedAt:
                  new Date(),
              },
            });
          } else if (
            existingCollection.status !==
            "COLLECTED"
          ) {
            await tx.codCollection.update({
              where: {
                shipmentId:
                  existingShipment.id,
              },

              data: {
                amount:
                  existingShipment.codAmount,

                status:
                  "COLLECTED",

                collectedAt:
                  new Date(),
              },
            });
          }

          // ------------------------------------------------
          // ACCOUNTING
          // ------------------------------------------------

          const existingCodEntry =
            await tx.accountingEntry.findFirst({
              where: {
                shipmentId:
                  existingShipment.id,

                type:
                  "COD_COLLECTION",
              },
            });

          if (!existingCodEntry) {
            await tx.accountingEntry.create({
              data: {
                vendorId:
                  existingShipment.vendorId,

                shipmentId:
                  existingShipment.id,

                type:
                  "COD_COLLECTION",

                direction:
                  "CREDIT",

                amount:
                  existingShipment.codAmount,

                description:
                  `COD collected for shipment ${existingShipment.trackingNumber}`,
              },
            });
          }
        }

        // ==================================================
        // NOTIFICATION
        // ==================================================

        await tx.notification.create({
          data: {
            shipmentId:
              existingShipment.id,

            title:
              "Shipment Status Updated",

            message:
              `Shipment ${existingShipment.trackingNumber} is now ${status.replaceAll(
                "_",
                " "
              )}.`,
          },
        });
      },

      {
        timeout: 15000,
        maxWait: 10000,
      }
    );

    // ========================================================
    // GET UPDATED SHIPMENT
    // ========================================================

    const shipment =
      await prisma.shipment.findUnique({
        where: {
          id:
            shipmentId,
        },

        include:
          shipmentInclude,
      });

    return res.status(200).json({
      message:
        "Shipment status updated successfully.",

      shipment,
    });
  } catch (error) {
    console.error(
      "UPDATE STATUS ERROR:",
      error
    );

    return res.status(500).json({
      message:
        error?.message ||
        "Failed to update shipment status.",
    });
  }
};

// ============================================================
// DELETE SHIPMENT
//
// DELETE /api/shipment/:id
// ============================================================

export const deleteShipment =
  async (req, res) => {
    try {
      const shipmentId =
        String(req.params.id);

      const shipment =
        await prisma.shipment.findUnique({
          where: {
            id:
              shipmentId,
          },
        });

      if (!shipment) {
        return res.status(404).json({
          message:
            "Shipment not found.",
        });
      }

      await prisma.shipment.delete({
        where: {
          id:
            shipmentId,
        },
      });

      return res.status(200).json({
        message:
          "Shipment deleted successfully.",
      });
    } catch (error) {
      console.error(
        "DELETE SHIPMENT ERROR:",
        error
      );

      return res.status(500).json({
        message:
          error?.message ||
          "Failed to delete shipment.",
      });
    }
  };

// ============================================================
// ASSIGN RIDER
//
// PATCH /api/shipment/:id/assign-rider
// ============================================================

export const assignRider =
  async (req, res) => {
    try {
      const shipmentId =
        String(req.params.id);

      const numericRiderId =
        Number(req.body.riderId);

      if (
        !Number.isInteger(numericRiderId) ||
        numericRiderId <= 0
      ) {
        return res.status(400).json({
          message:
            "Valid rider ID is required.",
        });
      }

      const shipment =
        await prisma.shipment.findUnique({
          where: {
            id:
              shipmentId,
          },
        });

      if (!shipment) {
        return res.status(404).json({
          message:
            "Shipment not found.",
        });
      }

      const rider =
        await prisma.rider.findUnique({
          where: {
            id:
              numericRiderId,
          },

          include: {
            user: true,
          },
        });

      if (!rider) {
        return res.status(404).json({
          message:
            "Rider not found.",
        });
      }

      if (!rider.isAvailable) {
        return res.status(400).json({
          message:
            "Rider is not available.",
        });
      }

      const updatedShipment =
        await prisma.shipment.update({
          where: {
            id:
              shipmentId,
          },

          data: {
            riderId:
              rider.id,

            // Automatically move:
            // IN_WAREHOUSE -> ASSIGNED_TO_RIDER
            ...(shipment.status === "IN_WAREHOUSE" && {
              status:
                "ASSIGNED_TO_RIDER",
            }),
          },

          include:
            shipmentInclude,
        });

      // Tracking
      await prisma.tracking.create({
        data: {
          shipmentId:
            shipmentId,

          status:
            updatedShipment.status,

          location:
            "Warehouse",

          message:
            `Rider ${rider.user?.name || rider.phone || rider.id} assigned to shipment.`,
        },
      });

      return res.status(200).json({
        message:
          "Rider assigned successfully.",

        shipment:
          updatedShipment,
      });
    } catch (error) {
      console.error(
        "ASSIGN RIDER ERROR:",
        error
      );

      return res.status(500).json({
        message:
          error?.message ||
          "Failed to assign rider.",
      });
    }
  };

// ============================================================
// ADD SHIPMENT MESSAGE
//
// POST /api/shipment/:id/message
// ============================================================

export const addShipmentMessage =
  async (req, res) => {
    try {
      const {
        message,
        location,
      } = req.body;

      if (!String(message || "").trim()) {
        return res.status(400).json({
          message:
            "Message is required.",
        });
      }

      const shipment =
        await prisma.shipment.findUnique({
          where: {
            id:
              String(req.params.id),
          },
        });

      if (!shipment) {
        return res.status(404).json({
          message:
            "Shipment not found.",
        });
      }

      const tracking =
        await prisma.tracking.create({
          data: {
            shipmentId:
              shipment.id,

            status:
              shipment.status,

            location:
              String(location || "").trim() ||
              "Rider Location",

            message:
              String(message).trim(),
          },
        });

      return res.status(201).json({
        message:
          "Delivery message added successfully.",

        tracking,
      });
    } catch (error) {
      console.error(
        "ADD SHIPMENT MESSAGE ERROR:",
        error
      );

      return res.status(500).json({
        message:
          error?.message ||
          "Failed to add shipment message.",
      });
    }
  };