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
// ============================================================

// ============================================================
// CREATE SHIPMENT
//
// POST /api/shipment
//
// totalBox:
// - Optional
// - Default = 1
// - Must be a positive integer
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

      // ======================================================
      // TOTAL BOX
      // ======================================================
      totalBox,

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
    // TOTAL BOX
    //
    // If frontend doesn't send totalBox:
    //     default = 1
    //
    // Examples:
    //     undefined -> 1
    //     null      -> 1
    //     ""        -> 1
    //     "2"       -> 2
    //     3         -> 3
    //
    // Invalid:
    //     0
    //     -1
    //     1.5
    //     abc
    // ========================================================

    let finalTotalBox = 1;

    if (
      totalBox !== undefined &&
      totalBox !== null &&
      totalBox !== ""
    ) {
      finalTotalBox = Number(totalBox);
    }

    if (
      !Number.isInteger(finalTotalBox) ||
      finalTotalBox <= 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Total box must be a positive whole number.",
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

      finalVendorId = authenticatedVendorId;
    }

    // ========================================================
    // STAFF / ADMIN CREATES SHIPMENT
    // ========================================================

    if (role === "STAFF" || role === "ADMIN") {
      if (
        vendorId !== null &&
        vendorId !== undefined &&
        vendorId !== "" &&
        Number(vendorId) > 0
      ) {
        finalVendorId = Number(vendorId);
      }

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
    // WALK-IN / UNREGISTERED SENDER VALIDATION
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

    let finalSenderName =
      String(senderName || "").trim();

    let finalSenderPhone =
      String(senderPhone || "").trim();

    let finalSenderAddress =
      String(senderAddress || "").trim();

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
    // INITIAL TRACKING LOCATION
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

                // ----------------------------------------------
                // SENDER
                // ----------------------------------------------

                senderName:
                  finalSenderName,

                senderPhone:
                  finalSenderPhone,

                senderAddress:
                  finalSenderAddress,

                // ----------------------------------------------
                // RECEIVER
                // ----------------------------------------------

                receiverName:
                  String(receiverName).trim(),

                receiverPhone:
                  String(receiverPhone).trim(),

                receiverAddress:
                  String(receiverAddress).trim(),

                // ----------------------------------------------
                // PACKAGE
                // ----------------------------------------------

                packageType:
                  normalizedPackageType,

                weight:
                  finalWeight,

                // ----------------------------------------------
                // TOTAL BOX
                // ----------------------------------------------

                totalBox:
                  finalTotalBox,

                // ----------------------------------------------
                // PAYMENT
                // ----------------------------------------------

                paymentType:
                  normalizedPaymentType,

                codAmount:
                  finalCodAmount,

                // ----------------------------------------------
                // CHARGE
                // ----------------------------------------------

                shippingCharge:
                  shippingCharge,

                // ----------------------------------------------
                // OTHER
                // ----------------------------------------------

                notes:
                  String(notes || "").trim() || null,

                qrCode,

                origin:
                  finalOrigin,

                deliveryZone,

                status:
                  "CREATED",

                // ----------------------------------------------
                // RELATIONS
                // ----------------------------------------------

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
          // INITIAL TRACKING
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
                String(
                  req.user?.id ||
                  role
                ),
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
          // Only registered vendors have vendor accounting.
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

      shipment:
        result,
    });
  } catch (error) {
    console.error(
      "CREATE SHIPMENT ERROR:",
      error
    );

    // ========================================================
    // PRISMA UNIQUE ERROR
    // ========================================================

    if (error?.code === "P2002") {
      return res.status(409).json({
        success: false,
        message:
          "A shipment with this unique information already exists. Please try again.",
      });
    }

    // ========================================================
    // PRISMA FOREIGN KEY ERROR
    // ========================================================

    if (error?.code === "P2003") {
      return res.status(400).json({
        success: false,
        message:
          "Invalid vendor, staff, location rate, or related shipment information.",
      });
    }

    // ========================================================
    // SERVER ERROR
    // ========================================================

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
// SCAN SHIPMENT
//
// POST /api/shipment/scan
//
// Body:
//
// {
//   trackingNumber: "RC-1789981579523-622"
// }
//
// Returns shipment + actions available to logged-in user.
// ============================================================

export const scanShipment = async (req, res) => {
  try {
    const role = getUserRole(req);

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    if (!["ADMIN", "STAFF", "RIDER"].includes(role)) {
      return res.status(403).json({
        success: false,
        message:
          "You are not allowed to scan shipments.",
      });
    }

    let trackingNumber =
      String(
        req.body?.trackingNumber || ""
      ).trim();

    if (!trackingNumber) {
      return res.status(400).json({
        success: false,
        message:
          "Tracking number is required.",
      });
    }

    // ========================================================
    // SUPPORT QR URL
    // ========================================================

    try {
      if (
        trackingNumber.startsWith("http://") ||
        trackingNumber.startsWith("https://")
      ) {
        const url =
          new URL(trackingNumber);

        const parts =
          url.pathname
            .split("/")
            .filter(Boolean);

        const trackIndex =
          parts.findIndex(
            (part) =>
              part.toLowerCase() ===
              "track"
          );

        if (
          trackIndex !== -1 &&
          parts[trackIndex + 1]
        ) {
          trackingNumber =
            decodeURIComponent(
              parts[trackIndex + 1]
            );
        }
      }
    } catch {
      // Keep original scanner value.
    }

    // ========================================================
    // FIND SHIPMENT
    // ========================================================

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
        success: false,
        message:
          `Shipment ${trackingNumber} was not found.`,
      });
    }

    // ========================================================
    // GET RIDER ID
    // ========================================================

    let riderId = null;

    if (role === "RIDER") {
      if (req.user?.rider?.id) {
        riderId =
          Number(req.user.rider.id);
      }

      if (req.user?.riderId) {
        riderId =
          Number(req.user.riderId);
      }

      if (!riderId && req.user?.id) {
        const rider =
          await prisma.rider.findUnique({
            where: {
              userId:
                Number(req.user.id),
            },

            select: {
              id: true,
            },
          });

        riderId =
          rider?.id ?? null;
      }
    }

    // ========================================================
    // ALLOWED ACTIONS
    // ========================================================

    const actions = [];

    const status =
      shipment.status;

    // ========================================================
    // ADMIN
    // ========================================================

    if (role === "ADMIN") {
      if (status === "CREATED") {
        actions.push("RECEIVE");
      }

      if (status === "IN_WAREHOUSE") {
        actions.push("ASSIGN_RIDER");
      }

      if (status === "ASSIGNED_TO_RIDER") {
        actions.push("PICKUP");
        actions.push("OUT_FOR_DELIVERY");
      }

      if (status === "OUT_FOR_DELIVERY") {
        actions.push("DELIVER");
        actions.push("REQUEST_RETURN");
      }

      if (status === "RETURN_REQUESTED") {
        actions.push(
          "ASSIGN_RETURN_RIDER"
        );
      }

      if (
        status ===
        "RETURN_ASSIGNED_TO_RIDER"
      ) {
        actions.push(
          "RETURN_PICKUP"
        );
      }

      if (
        status ===
        "RETURN_PICKED_UP_FROM_CUSTOMER"
      ) {
        actions.push(
          "RETURN_TO_WAREHOUSE"
        );
      }

      if (
        status ===
        "RETURN_IN_WAREHOUSE"
      ) {
        actions.push(
          "OUT_FOR_RETURN"
        );
      }

      if (status === "OUT_FOR_RETURN") {
        actions.push(
          "RETURNED_TO_VENDOR"
        );
      }
    }

    // ========================================================
    // STAFF
    // ========================================================

    if (role === "STAFF") {
      if (status === "CREATED") {
        actions.push("RECEIVE");
      }

      if (status === "IN_WAREHOUSE") {
        actions.push("ASSIGN_RIDER");
      }

      if (
        status ===
        "RETURN_IN_WAREHOUSE"
      ) {
        actions.push(
          "ASSIGN_RETURN_RIDER"
        );
      }
    }

    // ========================================================
    // RIDER
    // ========================================================

    if (role === "RIDER") {
      const isAssigned =
        riderId &&
        shipment.riderId === riderId;

      if (isAssigned) {
        if (
          status ===
          "ASSIGNED_TO_RIDER"
        ) {
          actions.push("PICKUP");
        }

        if (
          status ===
          "OUT_FOR_DELIVERY"
        ) {
          actions.push("DELIVER");
          actions.push(
            "REQUEST_RETURN"
          );
        }

        if (
          status ===
          "RETURN_ASSIGNED_TO_RIDER"
        ) {
          actions.push(
            "RETURN_PICKUP"
          );
        }

        if (
          status ===
          "RETURN_PICKED_UP_FROM_CUSTOMER"
        ) {
          actions.push(
            "RETURN_TO_WAREHOUSE"
          );
        }
      }
    }

    // ========================================================
    // RESPONSE
    // ========================================================

    return res.status(200).json({
      success: true,

      shipment: {
        id:
          shipment.id,

        trackingNumber:
          shipment.trackingNumber,

        status:
          shipment.status,

        senderName:
          shipment.senderName,

        senderPhone:
          shipment.senderPhone,

        senderAddress:
          shipment.senderAddress,

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

        notes:
          shipment.notes,

        vendor:
          shipment.vendor
            ? {
                id:
                  shipment.vendor.id,

                companyName:
                  shipment.vendor.companyName,

                contactId:
                  shipment.vendor.contactId,

                location:
                  shipment.vendor.location,
              }
            : null,

        rider:
          shipment.rider
            ? {
                id:
                  shipment.rider.id,

                name:
                  shipment.rider.user?.name ||
                  shipment.rider.phone,

                phone:
                  shipment.rider.phone,
              }
            : null,

        trackings:
          shipment.trackings,

        codCollection:
          shipment.codCollection,
      },

      currentUser: {
        role,
        riderId,
      },

      actions,
    });
  } catch (error) {
    console.error(
      "SCAN SHIPMENT ERROR:",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        error?.message ||
        "Failed to scan shipment.",
    });
  }
};

// ============================================================
// SCAN ACTION
//
// POST /api/shipment/scan/action
//
// Body:
//
// {
//   trackingNumber: "RC-1789981579523-622",
//   action: "RECEIVE",
//   location: "Main Warehouse",
//   notes: ""
// }
//
// IMPORTANT:
// This endpoint does NOT accept arbitrary status.
// The server decides the next status.
// ============================================================

export const scanShipmentAction = async (
  req,
  res
) => {
  try {
    const role =
      getUserRole(req);

    // ========================================================
    // AUTH
    // ========================================================

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message:
          "Authentication required.",
      });
    }

    if (
      ![
        "ADMIN",
        "STAFF",
        "RIDER",
      ].includes(role)
    ) {
      return res.status(403).json({
        success: false,
        message:
          "You are not allowed to perform scan actions.",
      });
    }

    // ========================================================
    // BODY
    // ========================================================

    let trackingNumber =
      String(
        req.body?.trackingNumber || ""
      ).trim();

    const action =
      String(
        req.body?.action || ""
      )
        .trim()
        .toUpperCase();

    const location =
      String(
        req.body?.location || ""
      ).trim() ||
      "Main Warehouse";

    const notes =
      String(
        req.body?.notes || ""
      ).trim() || null;

    // ========================================================
    // VALIDATION
    // ========================================================

    if (!trackingNumber) {
      return res.status(400).json({
        success: false,
        message:
          "Tracking number is required.",
      });
    }

    if (!action) {
      return res.status(400).json({
        success: false,
        message:
          "Action is required.",
      });
    }

    // ========================================================
    // SUPPORT QR URL HERE TOO
    //
    // This makes the action endpoint safe even if the
    // frontend accidentally sends the full QR URL.
    // ========================================================

    try {
      if (
        trackingNumber.startsWith(
          "http://"
        ) ||
        trackingNumber.startsWith(
          "https://"
        )
      ) {
        const url =
          new URL(trackingNumber);

        const parts =
          url.pathname
            .split("/")
            .filter(Boolean);

        const trackIndex =
          parts.findIndex(
            (part) =>
              part.toLowerCase() ===
              "track"
          );

        if (
          trackIndex !== -1 &&
          parts[trackIndex + 1]
        ) {
          trackingNumber =
            decodeURIComponent(
              parts[
                trackIndex + 1
              ]
            );
        }
      }
    } catch {
      // Keep original value.
    }

    // ========================================================
    // FIND SHIPMENT
    // ========================================================

    const shipment =
      await prisma.shipment.findUnique({
        where: {
          trackingNumber,
        },

        include: {
          vendor: true,

          codCollection: true,

          rider: {
            include: {
              user: true,
            },
          },
        },
      });

    if (!shipment) {
      return res.status(404).json({
        success: false,
        message:
          `Shipment ${trackingNumber} was not found.`,
      });
    }

    // ========================================================
    // GET RIDER ID
    // ========================================================

    let riderId = null;

    if (role === "RIDER") {
      if (req.user?.rider?.id) {
        riderId =
          Number(req.user.rider.id);
      }

      if (req.user?.riderId) {
        riderId =
          Number(req.user.riderId);
      }

      if (!riderId && req.user?.id) {
        const rider =
          await prisma.rider.findUnique({
            where: {
              userId:
                Number(req.user.id),
            },

            select: {
              id: true,
            },
          });

        riderId =
          rider?.id ?? null;
      }

      if (!riderId) {
        return res.status(403).json({
          success: false,
          message:
            "Rider profile not found.",
        });
      }
    }

    // ========================================================
    // RIDER SECURITY
    // ========================================================

    if (
      role === "RIDER" &&
      shipment.riderId !== riderId
    ) {
      return res.status(403).json({
        success: false,
        message:
          "This shipment is not assigned to you.",
      });
    }

    // ========================================================
    // CURRENT STATUS
    // ========================================================

    const previousStatus =
      shipment.status;

    let newStatus = null;

    // ========================================================
    // RECEIVE
    // CREATED -> IN_WAREHOUSE
    // ========================================================

    if (action === "RECEIVE") {
      if (
        ![
          "STAFF",
          "ADMIN",
        ].includes(role)
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Only staff or admin can receive shipments.",
        });
      }

      if (
        previousStatus !==
        "CREATED"
      ) {
        return res.status(400).json({
          success: false,
          message:
            `Shipment cannot be received from ${previousStatus}.`,
        });
      }

      newStatus =
        "IN_WAREHOUSE";
    }

    // ========================================================
    // PICKUP
    // ASSIGNED_TO_RIDER -> OUT_FOR_DELIVERY
    // ========================================================

    else if (
      action === "PICKUP"
    ) {
      if (role !== "RIDER") {
        return res.status(403).json({
          success: false,
          message:
            "Only rider can pickup shipment.",
        });
      }

      if (
        previousStatus !==
        "ASSIGNED_TO_RIDER"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Shipment is not waiting for rider pickup.",
        });
      }

      newStatus =
        "OUT_FOR_DELIVERY";
    }

    // ========================================================
    // OUT FOR DELIVERY
    // ASSIGNED_TO_RIDER -> OUT_FOR_DELIVERY
    // ========================================================

    else if (
      action ===
      "OUT_FOR_DELIVERY"
    ) {
      if (
        ![
          "RIDER",
          "ADMIN",
        ].includes(role)
      ) {
        return res.status(403).json({
          success: false,
          message:
            "You are not allowed to send shipment out for delivery.",
        });
      }

      if (
        previousStatus !==
        "ASSIGNED_TO_RIDER"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Shipment must be assigned to rider first.",
        });
      }

      newStatus =
        "OUT_FOR_DELIVERY";
    }

    // ========================================================
    // DELIVER
    // OUT_FOR_DELIVERY -> DELIVERED
    // ========================================================

    else if (
      action === "DELIVER"
    ) {
      if (
        ![
          "RIDER",
          "ADMIN",
        ].includes(role)
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Only rider or admin can deliver shipment.",
        });
      }

      if (
        previousStatus !==
        "OUT_FOR_DELIVERY"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Shipment is not out for delivery.",
        });
      }

      newStatus =
        "DELIVERED";
    }

    // ========================================================
    // REQUEST RETURN
    // OUT_FOR_DELIVERY -> RETURN_REQUESTED
    // ========================================================

    else if (
      action ===
      "REQUEST_RETURN"
    ) {
      if (
        ![
          "RIDER",
          "ADMIN",
        ].includes(role)
      ) {
        return res.status(403).json({
          success: false,
          message:
            "You are not allowed to request return.",
        });
      }

      if (
        previousStatus !==
        "OUT_FOR_DELIVERY"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Return can only be requested while out for delivery.",
        });
      }

      newStatus =
        "RETURN_REQUESTED";
    }

    // ========================================================
    // ASSIGN RETURN RIDER
    // ========================================================

    else if (
      action ===
      "ASSIGN_RETURN_RIDER"
    ) {
      if (
        ![
          "STAFF",
          "ADMIN",
        ].includes(role)
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Only staff or admin can assign return rider.",
        });
      }

      if (
        previousStatus !==
        "RETURN_REQUESTED"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Shipment does not have a pending return request.",
        });
      }

      return res.status(400).json({
        success: false,
        message:
          "Use the existing assign-rider API to select the return rider.",
      });
    }

    // ========================================================
    // RETURN PICKUP
    // RETURN_ASSIGNED_TO_RIDER
    // -> RETURN_PICKED_UP_FROM_CUSTOMER
    // ========================================================

    else if (
      action ===
      "RETURN_PICKUP"
    ) {
      if (role !== "RIDER") {
        return res.status(403).json({
          success: false,
          message:
            "Only rider can pickup return.",
        });
      }

      if (
        previousStatus !==
        "RETURN_ASSIGNED_TO_RIDER"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Return is not assigned to rider.",
        });
      }

      newStatus =
        "RETURN_PICKED_UP_FROM_CUSTOMER";
    }

    // ========================================================
    // RETURN TO WAREHOUSE
    // ========================================================

    else if (
      action ===
      "RETURN_TO_WAREHOUSE"
    ) {
      if (
        ![
          "RIDER",
          "ADMIN",
        ].includes(role)
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Only rider or admin can return shipment to warehouse.",
        });
      }

      if (
        previousStatus !==
        "RETURN_PICKED_UP_FROM_CUSTOMER"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Shipment has not been picked up for return.",
        });
      }

      newStatus =
        "RETURN_IN_WAREHOUSE";
    }

    // ========================================================
    // OUT FOR RETURN
    // RETURN_IN_WAREHOUSE -> OUT_FOR_RETURN
    // ========================================================

    else if (
      action ===
      "OUT_FOR_RETURN"
    ) {
      if (
        ![
          "STAFF",
          "ADMIN",
        ].includes(role)
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Only staff or admin can send return shipment.",
        });
      }

      if (
        previousStatus !==
        "RETURN_IN_WAREHOUSE"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Return shipment is not in warehouse.",
        });
      }

      newStatus =
        "OUT_FOR_RETURN";
    }

    // ========================================================
    // RETURNED TO VENDOR
    // OUT_FOR_RETURN -> RETURNED_TO_VENDOR
    // ========================================================

    else if (
      action ===
      "RETURNED_TO_VENDOR"
    ) {
      if (
        ![
          "STAFF",
          "ADMIN",
        ].includes(role)
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Only staff or admin can complete return.",
        });
      }

      if (
        previousStatus !==
        "OUT_FOR_RETURN"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Shipment is not out for return.",
        });
      }

      newStatus =
        "RETURNED_TO_VENDOR";
    }

    // ========================================================
    // UNSUPPORTED ACTION
    // ========================================================

    else {
      return res.status(400).json({
        success: false,
        message:
          `Unsupported scan action: ${action}`,
      });
    }

    // ========================================================
    // TRANSACTION
    // ========================================================

    const updatedShipment =
      await prisma.$transaction(
        async (tx) => {
          // ==================================================
          // UPDATE SHIPMENT
          // ==================================================

          const updated =
            await tx.shipment.update({
              where: {
                id:
                  shipment.id,
              },

              data: {
                status:
                  newStatus,
              },

              include:
                shipmentInclude,
            });

          // ==================================================
          // TRACKING
          // ==================================================

          await tx.tracking.create({
            data: {
              shipmentId:
                shipment.id,

              status:
                newStatus,

              location,

              message:
                notes ||
                `Shipment scanned. Action: ${action.replaceAll(
                  "_",
                  " "
                )}.`,

              createdBy:
                String(
                  req.user?.id ||
                  role
                ),
            },
          });

          // ==================================================
          // IMPORTANT:
          // NO shipmentScan.create()
          //
          // Your Prisma schema does not have a
          // ShipmentScan model.
          //
          // Tracking already records the status history.
          // ==================================================

          // ==================================================
          // COD
          // ==================================================

          if (
            newStatus ===
              "DELIVERED" &&
            shipment.paymentType ===
              "COD" &&
            Number(
              shipment.codAmount
            ) > 0
          ) {
            if (shipment.vendorId) {
              // --------------------------------------------
              // EXISTING COD COLLECTION
              // --------------------------------------------

              if (
                shipment.codCollection
              ) {
                await tx.codCollection.update({
                  where: {
                    id:
                      shipment
                        .codCollection
                        .id,
                  },

                  data: {
                    status:
                      "COLLECTED",

                    collectedAt:
                      new Date(),

                    riderId:
                      riderId ||
                      shipment.riderId ||
                      null,
                  },
                });
              }

              // --------------------------------------------
              // CREATE COD COLLECTION
              // --------------------------------------------

              else {
                await tx.codCollection.create({
                  data: {
                    shipmentId:
                      shipment.id,

                    amount:
                      shipment.codAmount,

                    status:
                      "COLLECTED",

                    collectedAt:
                      new Date(),

                    riderId:
                      riderId ||
                      shipment.riderId ||
                      null,
                  },
                });
              }

              // --------------------------------------------
              // AVOID DUPLICATE COD ACCOUNTING
              // --------------------------------------------

              const existingCodEntry =
                await tx.accountingEntry.findFirst({
                  where: {
                    shipmentId:
                      shipment.id,

                    type:
                      "COD_COLLECTION",
                  },
                });

              if (
                !existingCodEntry
              ) {
                await tx.accountingEntry.create({
                  data: {
                    vendorId:
                      shipment.vendorId,

                    shipmentId:
                      shipment.id,

                    type:
                      "COD_COLLECTION",

                    direction:
                      "CREDIT",

                    amount:
                      shipment.codAmount,

                    description:
                      `COD collected for shipment ${shipment.trackingNumber}`,
                  },
                });
              }
            }
          }

          // ==================================================
          // NOTIFICATION
          // ==================================================

          await tx.notification.create({
            data: {
              shipmentId:
                shipment.id,

              title:
                "Shipment Scanned",

              message:
                `${shipment.trackingNumber} changed from ${previousStatus} to ${newStatus}.`,
            },
          });

          return updated;
        },

        {
          timeout: 15000,
          maxWait: 10000,
        }
      );

    // ========================================================
    // RESPONSE
    // ========================================================

    return res.status(200).json({
      success: true,

      message:
        `${action.replaceAll(
          "_",
          " "
        )} completed successfully.`,

      shipment:
        updatedShipment,
    });
  } catch (error) {
    console.error(
      "SCAN ACTION ERROR:",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        error?.message ||
        "Failed to process scan action.",
    });
  }
};

// ============================================================
// GET MY SHIPMENTS
//
// GET /api/shipment/my
// ============================================================

export const getMyShipments = async (
  req,
  res
) => {
  try {
    const role =
      getUserRole(req);

    if (!req.user) {
      return res.status(401).json({
        message:
          "Authentication required.",
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
          createdAt:
            "desc",
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

export const getAllShipments = async (
  req,
  res
) => {
  try {
    const role =
      getUserRole(req);

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
          createdAt:
            "desc",
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

export const getMyRiderShipments =
  async (
    req,
    res
  ) => {
    try {
      const role =
        getUserRole(req);

      if (role !== "RIDER") {
        return res.status(403).json({
          message:
            "Only riders can access rider shipments.",
        });
      }

      const riderId =
        await (async () => {
          if (req.user?.rider?.id) {
            return Number(
              req.user.rider.id
            );
          }

          if (req.user?.riderId) {
            return Number(
              req.user.riderId
            );
          }

          if (req.user?.id) {
            const rider =
              await prisma.rider.findUnique({
                where: {
                  userId:
                    Number(
                      req.user.id
                    ),
                },

                select: {
                  id: true,
                },
              });

            return (
              rider?.id ?? null
            );
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
            createdAt:
              "desc",
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
  async (
    req,
    res
  ) => {
    try {
      const trackingNumber =
        String(
          req.params
            .trackingNumber || ""
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

export const getShipment =
  async (
    req,
    res
  ) => {
    try {
      const shipment =
        await prisma.shipment.findUnique({
          where: {
            id:
              String(
                req.params.id
              ),
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
  async (
    req,
    res
  ) => {
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
              String(
                req.params.id
              ),
          },

          data: {
            ...(receiverName !==
              undefined && {
              receiverName:
                String(
                  receiverName
                ).trim(),
            }),

            ...(receiverPhone !==
              undefined && {
              receiverPhone:
                String(
                  receiverPhone
                ).trim(),
            }),

            ...(receiverAddress !==
              undefined && {
              receiverAddress:
                String(
                  receiverAddress
                ).trim(),
            }),

            ...(packageType !==
              undefined && {
              packageType:
                normalizeUpper(
                  packageType
                ),
            }),

            ...(weight !==
              undefined && {
              weight:
                Number(weight),
            }),

            ...(shippingCharge !==
              undefined && {
              shippingCharge:
                Number(
                  shippingCharge
                ),
            }),

            ...(codAmount !==
              undefined && {
              codAmount:
                Number(
                  codAmount
                ),
            }),

            ...(notes !==
              undefined && {
              notes:
                String(
                  notes || ""
                ).trim() ||
                null,
            }),

            ...(status !==
              undefined && {
              status:
                normalizeUpper(
                  status
                ),
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

export const updateStatus =
  async (
    req,
    res
  ) => {
    try {
      const shipmentId =
        String(
          req.params.id
        );

      const {
        status,
        location,
        message,
      } = req.body;

      const role =
        getUserRole(req);

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

      if (
        !allowedStatuses.includes(
          status
        )
      ) {
        return res.status(400).json({
          message:
            "Invalid shipment status.",

          allowedStatuses,
        });
      }

      const existingShipment =
        await prisma.shipment.findUnique({
          where: {
            id:
              shipmentId,
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
                String(
                  location || ""
                ).trim() ||
                "Main Office",

              message:
                String(
                  message || ""
                ).trim() ||
                `Shipment status changed to ${status}`,
            },
          });

          // ==================================================
          // COD
          // ==================================================

          if (
            status ===
              "DELIVERED" &&
            existingShipment.paymentType ===
              "COD" &&
            Number(
              existingShipment.codAmount
            ) > 0 &&
            existingShipment.vendorId
          ) {
            // ----------------------------------------------
            // COLLECTION
            // ----------------------------------------------

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

            // ----------------------------------------------
            // ACCOUNTING
            // ----------------------------------------------

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
  async (
    req,
    res
  ) => {
    try {
      const shipmentId =
        String(
          req.params.id
        );

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
  async (
    req,
    res
  ) => {
    try {
      const shipmentId =
        String(
          req.params.id
        );

      const numericRiderId =
        Number(
          req.body.riderId
        );

      if (
        !Number.isInteger(
          numericRiderId
        ) ||
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

            ...(shipment.status ===
              "IN_WAREHOUSE" && {
              status:
                "ASSIGNED_TO_RIDER",
            }),
          },

          include:
            shipmentInclude,
        });

      // ========================================================
      // TRACKING
      // ========================================================

      await prisma.tracking.create({
        data: {
          shipmentId:
            shipmentId,

          status:
            updatedShipment.status,

          location:
            "Warehouse",

          message:
            `Rider ${
              rider.user?.name ||
              rider.phone ||
              rider.id
            } assigned to shipment.`,
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
  async (
    req,
    res
  ) => {
    try {
      const {
        message,
        location,
      } = req.body;

      if (
        !String(
          message || ""
        ).trim()
      ) {
        return res.status(400).json({
          message:
            "Message is required.",
        });
      }

      const shipment =
        await prisma.shipment.findUnique({
          where: {
            id:
              String(
                req.params.id
              ),
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
              String(
                location || ""
              ).trim() ||
              "Rider Location",

            message:
              String(
                message
              ).trim(),
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
          "Failed to add delivery message.",
      });
    }
  };