import prisma from "../config/prisma.js";

// ============================================================
// HELPERS
// ============================================================

const getUserRole = (req) => {
  return req.user?.role?.toUpperCase();
};

// ============================================================
// GET VENDOR ID
// ============================================================

const getVendorId = async (req) => {
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
    });

    return vendor?.id ?? null;
  }

  return null;
};

// ============================================================
// GET RIDER ID
// ============================================================

const getRiderId = async (req) => {
  if (req.user?.rider?.id) {
    return Number(req.user.rider.id);
  }

  if (req.user?.riderId) {
    return Number(req.user.riderId);
  }

  if (req.user?.id) {
    const rider = await prisma.rider.findUnique({
      where: {
        userId: Number(req.user.id),
      },
    });

    return rider?.id ?? null;
  }

  return null;
};

// ============================================================
// VALID RETURN REASONS
// ============================================================

const validReturnReasons = [
  "CUSTOMER_CHANGED_MIND",
  "WRONG_PRODUCT",
  "DAMAGED_PRODUCT",
  "DEFECTIVE_PRODUCT",
  "WRONG_SIZE",
  "WRONG_COLOR",
  "PRODUCT_NOT_AS_DESCRIBED",
  "OTHER",
];

// ============================================================
// VALID RETURN STATUSES
// ============================================================

const validReturnStatuses = [
  "REQUESTED",
  "ASSIGNED_TO_RIDER",
  "PICKED_UP_FROM_CUSTOMER",
  "IN_WAREHOUSE",
  "OUT_FOR_RETURN",
  "RETURNED_TO_VENDOR",
  "CANCELLED",
];

// ============================================================
// SHIPMENT STATUS MAP
// ============================================================

const shipmentStatusMap = {
  REQUESTED: "RETURN_REQUESTED",

  ASSIGNED_TO_RIDER:
    "RETURN_ASSIGNED_TO_RIDER",

  PICKED_UP_FROM_CUSTOMER:
    "RETURN_PICKED_UP_FROM_CUSTOMER",

  IN_WAREHOUSE:
    "RETURN_IN_WAREHOUSE",

  OUT_FOR_RETURN:
    "OUT_FOR_RETURN",

  RETURNED_TO_VENDOR:
    "RETURNED_TO_VENDOR",

  CANCELLED:
    "DELIVERED",
};

// ============================================================
// COMMON RETURN INCLUDE
// ============================================================

const returnInclude = {
  rider: {
    include: {
      user: true,
    },
  },

  returnDeliveryRider: {
    include: {
      user: true,
    },
  },

  shipment: {
    include: {
      vendor: {
        include: {
          user: true,
        },
      },

      rider: {
        include: {
          user: true,
        },
      },

      trackings: {
        orderBy: {
          createdAt: "asc",
        },
      },

      locationRate: {
        include: {
          location: true,
          deliveryType: true,
        },
      },
    },
  },
};

// ============================================================
// 1. VENDOR REQUEST RETURN
// POST /api/returns
// ============================================================

export const createReturnRequest = async (req, res) => {
  try {
    const role = getUserRole(req);

    if (role !== "VENDOR") {
      return res.status(403).json({
        message: "Only vendors can request a return",
      });
    }

    const vendorId = await getVendorId(req);

    if (!vendorId) {
      return res.status(403).json({
        message: "Vendor account not found",
      });
    }

    const {
      shipmentId,
      reason,
      description,
      notes,
    } = req.body;

    if (!shipmentId) {
      return res.status(400).json({
        message: "Shipment ID is required",
      });
    }

    if (!reason) {
      return res.status(400).json({
        message: "Return reason is required",
      });
    }

    if (!validReturnReasons.includes(reason)) {
      return res.status(400).json({
        message: "Invalid return reason",
      });
    }

    const shipment = await prisma.shipment.findFirst({
      where: {
        id: String(shipmentId),
        vendorId,
      },

      include: {
        returnRequest: true,
      },
    });

    if (!shipment) {
      return res.status(404).json({
        message: "Shipment not found",
      });
    }

    if (shipment.status !== "DELIVERED") {
      return res.status(400).json({
        message:
          "Return can only be requested after shipment is delivered",
      });
    }

    if (shipment.returnRequest) {
      return res.status(400).json({
        message:
          "A return request already exists for this shipment",
        returnRequest: shipment.returnRequest,
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const returnRequest =
        await tx.returnRequest.create({
          data: {
            shipmentId: shipment.id,
            status: "REQUESTED",
            reason,
            description:
              description?.trim() || null,
            notes: notes?.trim() || null,
            returnCharge: 0,
          },
        });

      await tx.shipment.update({
        where: {
          id: shipment.id,
        },

        data: {
          status: "RETURN_REQUESTED",
        },
      });

      await tx.tracking.create({
        data: {
          shipmentId: shipment.id,

          status: "RETURN_REQUESTED",

          location:
            shipment.receiverAddress ||
            shipment.deliveryZone ||
            "Unknown",

          message:
            "Vendor requested a return for this shipment",

          createdBy: String(
            req.user?.id || vendorId
          ),
        },
      });

      await tx.notification.create({
        data: {
          shipmentId: shipment.id,

          title: "Return Requested",

          message:
            `Return requested for shipment ${shipment.trackingNumber}`,
        },
      });

      return returnRequest;
    });

    const finalReturn =
      await prisma.returnRequest.findUnique({
        where: {
          id: result.id,
        },

        include: returnInclude,
      });

    return res.status(201).json({
      message:
        "Return request created successfully",

      returnRequest: finalReturn,
    });
  } catch (error) {
    console.error(
      "CREATE RETURN ERROR:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to create return request",

      error: error.message,
    });
  }
};

// ============================================================
// 2. VENDOR GET OWN RETURNS
// GET /api/returns/my
// ============================================================

export const getMyReturns = async (req, res) => {
  try {
    const role = getUserRole(req);

    if (role !== "VENDOR") {
      return res.status(403).json({
        message:
          "Only vendors can access their returns",
      });
    }

    const vendorId = await getVendorId(req);

    if (!vendorId) {
      return res.status(403).json({
        message: "Vendor account not found",
      });
    }

    const returns =
      await prisma.returnRequest.findMany({
        where: {
          shipment: {
            vendorId,
          },
        },

        include: returnInclude,

        orderBy: {
          createdAt: "desc",
        },
      });

    return res.json({
      returns,
    });
  } catch (error) {
    console.error(
      "GET MY RETURNS ERROR:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to fetch returns",

      error: error.message,
    });
  }
};

// ============================================================
// 3. ADMIN / STAFF GET ALL RETURNS
// GET /api/returns/all
// ============================================================

export const getAllReturns = async (req, res) => {
  try {
    const role = getUserRole(req);

    if (
      role !== "ADMIN" &&
      role !== "STAFF"
    ) {
      return res.status(403).json({
        message:
          "Only admin and staff can access all returns",
      });
    }

    const returns =
      await prisma.returnRequest.findMany({
        include: returnInclude,

        orderBy: {
          createdAt: "desc",
        },
      });

    return res.json({
      returns,
    });
  } catch (error) {
    console.error(
      "GET ALL RETURNS ERROR:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to fetch returns",

      error: error.message,
    });
  }
};

// ============================================================
// 4. GET SINGLE RETURN
// GET /api/returns/:id
// ============================================================

export const getReturnById = async (req, res) => {
  try {
    const returnId = String(req.params.id);

    const returnRequest =
      await prisma.returnRequest.findUnique({
        where: {
          id: returnId,
        },

        include: returnInclude,
      });

    if (!returnRequest) {
      return res.status(404).json({
        message:
          "Return request not found",
      });
    }

    const role = getUserRole(req);

    // --------------------------------------------------------
    // VENDOR
    // --------------------------------------------------------

    if (role === "VENDOR") {
      const vendorId =
        await getVendorId(req);

      if (
        returnRequest.shipment.vendorId !==
        vendorId
      ) {
        return res.status(403).json({
          message:
            "You cannot view this return",
        });
      }
    }

    // --------------------------------------------------------
    // RIDER
    // --------------------------------------------------------

    if (role === "RIDER") {
      const riderId =
        await getRiderId(req);

      const isPickupRider =
        returnRequest.riderId === riderId;

      const isReturnDeliveryRider =
        returnRequest.returnDeliveryRiderId ===
        riderId;

      if (
        !isPickupRider &&
        !isReturnDeliveryRider
      ) {
        return res.status(403).json({
          message:
            "You cannot view this return",
        });
      }
    }

    return res.json({
      returnRequest,
    });
  } catch (error) {
    console.error(
      "GET RETURN ERROR:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to fetch return",

      error: error.message,
    });
  }
};

// ============================================================
// 5. ADMIN / STAFF ASSIGN RETURN RIDER
// PATCH /api/returns/:id/assign-rider
// ============================================================

export const assignReturnRider = async (
  req,
  res
) => {
  try {
    const role = getUserRole(req);

    if (
      role !== "ADMIN" &&
      role !== "STAFF"
    ) {
      return res.status(403).json({
        message:
          "Only admin or staff can assign return riders",
      });
    }

    const { id } = req.params;
    const { riderId } = req.body;

    if (!riderId) {
      return res.status(400).json({
        message: "Rider ID is required",
      });
    }

    const numericRiderId = Number(riderId);

    if (!Number.isInteger(numericRiderId)) {
      return res.status(400).json({
        message: "Invalid rider ID",
      });
    }

    const returnRequest =
      await prisma.returnRequest.findUnique({
        where: {
          id,
        },
      });

    if (!returnRequest) {
      return res.status(404).json({
        message:
          "Return request not found",
      });
    }

    const rider =
      await prisma.rider.findUnique({
        where: {
          id: numericRiderId,
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

    // ========================================================
    // REQUESTED
    // Customer -> Warehouse
    // ========================================================

    if (
      returnRequest.status ===
      "REQUESTED"
    ) {
      const updatedReturn =
        await prisma.returnRequest.update({
          where: {
            id,
          },

          data: {
            riderId:
              numericRiderId,

            status:
              "ASSIGNED_TO_RIDER",
          },

          include: {
            rider: {
              include: {
                user: true,
              },
            },

            returnDeliveryRider: {
              include: {
                user: true,
              },
            },

            shipment: true,
          },
        });

      return res.status(200).json({
        message:
          "Pickup rider assigned successfully",

        returnRequest:
          updatedReturn,
      });
    }

    // ========================================================
    // IN WAREHOUSE + DELIVER TO VENDOR
    // Warehouse -> Vendor
    // ========================================================

    if (
      returnRequest.status ===
        "IN_WAREHOUSE" &&
      returnRequest.deliveryOption ===
        "DELIVER_TO_VENDOR"
    ) {
      const updatedReturn =
        await prisma.returnRequest.update({
          where: {
            id,
          },

          data: {
            returnDeliveryRiderId:
              numericRiderId,
          },

          include: {
            rider: {
              include: {
                user: true,
              },
            },

            returnDeliveryRider: {
              include: {
                user: true,
              },
            },

            shipment: true,
          },
        });

      return res.status(200).json({
        message:
          "Return delivery rider assigned successfully",

        returnRequest:
          updatedReturn,
      });
    }

    // ========================================================
    // VENDOR PICKUP
    // ========================================================

    if (
      returnRequest.status ===
        "IN_WAREHOUSE" &&
      returnRequest.deliveryOption ===
        "VENDOR_PICKUP"
    ) {
      return res.status(400).json({
        message:
          "A return delivery rider is not required because the vendor will pick up the package.",
      });
    }

    return res.status(400).json({
      message:
        "Rider cannot be assigned at the current return stage.",
    });
  } catch (error) {
    console.error(
      "ASSIGN RETURN RIDER ERROR:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to assign rider",

      error: error.message,
    });
  }
};

// ============================================================
// 6. RIDER GET OWN RETURNS
// GET /api/returns/rider/my
// ============================================================

export const getMyRiderReturns =
  async (req, res) => {
    try {
      const role =
        getUserRole(req);

      if (role !== "RIDER") {
        return res.status(403).json({
          message:
            "Only riders can access rider returns",
        });
      }

      const riderId =
        await getRiderId(req);

      if (!riderId) {
        return res.status(403).json({
          message:
            "Rider account not found",
        });
      }

      const returns =
        await prisma.returnRequest.findMany({
          where: {
            OR: [
              {
                riderId,
              },
              {
                returnDeliveryRiderId:
                  riderId,
              },
            ],
          },

          include:
            returnInclude,

          orderBy: {
            createdAt: "desc",
          },
        });

      return res.json({
        returns,
      });
    } catch (error) {
      console.error(
        "GET RIDER RETURNS ERROR:",
        error
      );

      return res.status(500).json({
        message:
          "Failed to fetch rider returns",

        error:
          error.message,
      });
    }
  };

// ============================================================
// 7. UPDATE RETURN STATUS
// PATCH /api/returns/:id/status
// ============================================================

export const updateReturnStatus = async (
  req,
  res
) => {
  try {
    console.log(
      "\n========== UPDATE RETURN STATUS =========="
    );

    const role = getUserRole(req);

    const returnId =
      String(req.params.id);

    const {
      status,
      location,
      notes,
    } = req.body;

    console.log("ROLE:", role);
    console.log(
      "RETURN ID:",
      returnId
    );
    console.log(
      "REQUESTED STATUS:",
      status
    );

    // ========================================================
    // ROLE CHECK
    // ========================================================

    if (
      ![
        "RIDER",
        "ADMIN",
        "STAFF",
      ].includes(role)
    ) {
      return res.status(403).json({
        message:
          "You cannot update return status",
      });
    }

    // ========================================================
    // STATUS VALIDATION
    // ========================================================

    if (
      !validReturnStatuses.includes(
        status
      )
    ) {
      return res.status(400).json({
        message:
          "Invalid return status",
      });
    }

    // ========================================================
    // FIND RETURN
    // ========================================================

    const returnRequest =
      await prisma.returnRequest.findUnique({
        where: {
          id: returnId,
        },

        include: {
          shipment: true,
        },
      });

    if (!returnRequest) {
      return res.status(404).json({
        message:
          "Return request not found",
      });
    }

    console.log(
      "CURRENT STATUS:",
      returnRequest.status
    );

    console.log(
      "DELIVERY OPTION:",
      returnRequest.deliveryOption
    );

    console.log(
      "PICKUP RIDER:",
      returnRequest.riderId
    );

    console.log(
      "RETURN DELIVERY RIDER:",
      returnRequest.returnDeliveryRiderId
    );

    // ========================================================
    // SAME STATUS
    // ========================================================

    if (
      returnRequest.status ===
      status
    ) {
      return res.status(400).json({
        message:
          `Return is already ${status}`,
      });
    }

    // ========================================================
    // RIDER ID
    // ========================================================

    let currentRiderId = null;

    if (role === "RIDER") {
      currentRiderId =
        await getRiderId(req);

      if (!currentRiderId) {
        return res.status(403).json({
          message:
            "Rider account not found",
        });
      }
    }

    // ========================================================
    // TRANSITION VALIDATION
    // ========================================================

    let transitionAllowed =
      false;

    // REQUESTED
    if (
      returnRequest.status ===
      "REQUESTED"
    ) {
      transitionAllowed =
        status ===
          "ASSIGNED_TO_RIDER" ||
        status === "CANCELLED";
    }

    // ASSIGNED TO RIDER
    else if (
      returnRequest.status ===
      "ASSIGNED_TO_RIDER"
    ) {
      transitionAllowed =
        status ===
          "PICKED_UP_FROM_CUSTOMER" ||
        status === "CANCELLED";
    }

    // PICKED UP
    else if (
      returnRequest.status ===
      "PICKED_UP_FROM_CUSTOMER"
    ) {
      transitionAllowed =
        status === "IN_WAREHOUSE";
    }

    // IN WAREHOUSE
    else if (
      returnRequest.status ===
      "IN_WAREHOUSE"
    ) {
      // Vendor pickup
      if (
        returnRequest.deliveryOption ===
        "VENDOR_PICKUP"
      ) {
        transitionAllowed =
          status ===
          "RETURNED_TO_VENDOR";
      }

      // Delivery to vendor
      else if (
        returnRequest.deliveryOption ===
        "DELIVER_TO_VENDOR"
      ) {
        transitionAllowed =
          status ===
          "OUT_FOR_RETURN";
      }

      else {
        return res.status(400).json({
          message:
            "Return delivery option must be selected before updating the return from warehouse.",
        });
      }
    }

    // OUT FOR RETURN
    else if (
      returnRequest.status ===
      "OUT_FOR_RETURN"
    ) {
      transitionAllowed =
        status ===
        "RETURNED_TO_VENDOR";
    }

    // FINAL STATES
    else {
      transitionAllowed = false;
    }

    // ========================================================
    // TRANSITION REJECTED
    // ========================================================

    if (!transitionAllowed) {
      return res.status(400).json({
        message:
          `Cannot change return status from ${returnRequest.status} to ${status}`,
      });
    }

    // ========================================================
    // RIDER PERMISSION
    // ========================================================

    if (role === "RIDER") {
      // ------------------------------------------------------
      // PICKUP RIDER
      // ------------------------------------------------------

      if (
        (
          returnRequest.status ===
            "ASSIGNED_TO_RIDER" &&
          status ===
            "PICKED_UP_FROM_CUSTOMER"
        ) ||
        (
          returnRequest.status ===
            "PICKED_UP_FROM_CUSTOMER" &&
          status ===
            "IN_WAREHOUSE"
        )
      ) {
        if (
          returnRequest.riderId !==
          currentRiderId
        ) {
          return res.status(403).json({
            message:
              "This return pickup is not assigned to you",
          });
        }
      }

      // ------------------------------------------------------
      // RETURN DELIVERY RIDER
      // ------------------------------------------------------

      if (
        returnRequest.status ===
          "OUT_FOR_RETURN" &&
        status ===
          "RETURNED_TO_VENDOR"
      ) {
        if (
          returnRequest.returnDeliveryRiderId !==
          currentRiderId
        ) {
          return res.status(403).json({
            message:
              "This return delivery is not assigned to you",
          });
        }
      }

      // ------------------------------------------------------
      // VENDOR PICKUP
      // ------------------------------------------------------

      if (
        returnRequest.status ===
          "IN_WAREHOUSE" &&
        status ===
          "RETURNED_TO_VENDOR" &&
        returnRequest.deliveryOption ===
          "VENDOR_PICKUP"
      ) {
        return res.status(403).json({
          message:
            "Vendor pickup returns are completed by staff or admin after vendor pickup.",
        });
      }
    }

    // ========================================================
    // OUT FOR RETURN VALIDATION
    // ========================================================

    if (
      status === "OUT_FOR_RETURN"
    ) {
      if (
        returnRequest.deliveryOption !==
        "DELIVER_TO_VENDOR"
      ) {
        return res.status(400).json({
          message:
            "This return is not configured for delivery to vendor.",
        });
      }

      if (
        !returnRequest.returnDeliveryRiderId
      ) {
        return res.status(400).json({
          message:
            "Please assign a return delivery rider first.",
        });
      }
    }

    // ========================================================
    // RETURNED TO VENDOR VALIDATION
    // ========================================================

    if (
      status ===
      "RETURNED_TO_VENDOR"
    ) {
      if (
        returnRequest.deliveryOption ===
        "VENDOR_PICKUP"
      ) {
        // No rider required.
      }

      else if (
        returnRequest.deliveryOption ===
        "DELIVER_TO_VENDOR"
      ) {
        if (
          !returnRequest.returnDeliveryRiderId
        ) {
          return res.status(400).json({
            message:
              "Return delivery rider is required.",
          });
        }
      }

      else {
        return res.status(400).json({
          message:
            "Return delivery option is required.",
        });
      }
    }

    // ========================================================
    // UPDATE DATA
    // ========================================================

    const updateData = {
      status,
    };

    if (notes !== undefined) {
      updateData.notes =
        notes?.trim() || null;
    }

    if (
      status ===
        "PICKED_UP_FROM_CUSTOMER" &&
      !returnRequest.pickedUpAt
    ) {
      updateData.pickedUpAt =
        new Date();
    }

    if (
      status ===
        "RETURNED_TO_VENDOR" &&
      !returnRequest.completedAt
    ) {
      updateData.completedAt =
        new Date();
    }

    // ========================================================
    // SHIPMENT STATUS
    // ========================================================

    const shipmentStatus =
      shipmentStatusMap[status];

    if (!shipmentStatus) {
      return res.status(400).json({
        message:
          "No shipment status mapping found",
      });
    }

    // ========================================================
    // TRACKING
    // ========================================================

    const trackingMessages = {
      REQUESTED:
        "Return requested by vendor",

      ASSIGNED_TO_RIDER:
        "Return pickup assigned to rider",

      PICKED_UP_FROM_CUSTOMER:
        "Return package picked up from customer",

      IN_WAREHOUSE:
        "Return package received at warehouse",

      OUT_FOR_RETURN:
        "Return package is out for delivery to vendor",

      RETURNED_TO_VENDOR:
        "Return package successfully delivered to vendor",

      CANCELLED:
        "Return request cancelled",
    };

    const trackingStatusMap = {
      REQUESTED:
        "RETURN_REQUESTED",

      ASSIGNED_TO_RIDER:
        "RETURN_ASSIGNED_TO_RIDER",

      PICKED_UP_FROM_CUSTOMER:
        "RETURN_PICKED_UP_FROM_CUSTOMER",

      IN_WAREHOUSE:
        "RETURN_IN_WAREHOUSE",

      OUT_FOR_RETURN:
        "OUT_FOR_RETURN",

      RETURNED_TO_VENDOR:
        "RETURNED_TO_VENDOR",

      CANCELLED:
        "DELIVERED",
    };

    const trackingStatus =
      trackingStatusMap[status];

    // ========================================================
    // TRANSACTION
    // ========================================================

    const transactionResult =
      await prisma.$transaction(
        async (tx) => {
          const updatedReturn =
            await tx.returnRequest.update({
              where: {
                id: returnId,
              },

              data: updateData,

              select: {
                id: true,
                shipmentId: true,
                status: true,
                deliveryOption: true,
                riderId: true,
                returnDeliveryRiderId: true,
              },
            });

          await tx.shipment.update({
            where: {
              id:
                returnRequest.shipmentId,
            },

            data: {
              status:
                shipmentStatus,
            },
          });

          await tx.tracking.create({
            data: {
              shipmentId:
                returnRequest.shipmentId,

              status:
                trackingStatus,

              location:
                location?.trim() ||
                (
                  status ===
                  "IN_WAREHOUSE"
                    ? "Warehouse"
                    : returnRequest
                        .shipment
                        .receiverAddress ||
                      "Unknown"
                ),

              message:
                trackingMessages[
                  status
                ] ||
                `Return status updated to ${status.replaceAll(
                  "_",
                  " "
                )}`,

              createdBy: String(
                req.user?.id || ""
              ),
            },
          });

          await tx.notification.create({
            data: {
              shipmentId:
                returnRequest.shipmentId,

              title:
                "Return Status Updated",

              message:
                `Return for shipment ${
                  returnRequest
                    .shipment
                    .trackingNumber
                } is now ${status.replaceAll(
                  "_",
                  " "
                )}`,
            },
          });

          return {
            returnId:
              updatedReturn.id,

            shipmentId:
              updatedReturn.shipmentId,

            status:
              updatedReturn.status,
          };
        },
        {
          timeout: 15000,
          maxWait: 10000,
        }
      );

    // ========================================================
    // FETCH COMPLETE RETURN
    // ========================================================

    const finalReturn =
      await prisma.returnRequest.findUnique({
        where: {
          id:
            transactionResult.returnId,
        },

        include:
          returnInclude,
      });

    if (!finalReturn) {
      return res.status(404).json({
        message:
          "Return was updated but could not be loaded",
      });
    }

    console.log(
      "RETURN STATUS UPDATED:",
      finalReturn.status
    );

    console.log(
      "==========================================\n"
    );

    return res.json({
      message:
        "Return status updated successfully",

      returnRequest:
        finalReturn,
    });
  } catch (error) {
    console.error(
      "\n========== UPDATE RETURN STATUS ERROR =========="
    );

    console.error(error);

    console.error(
      "=================================================\n"
    );

    return res.status(500).json({
      message:
        "Failed to update return status",

      error:
        error?.message ||
        "Unknown server error",

      code:
        error?.code || null,
    });
  }
};

// ============================================================
// 8. SELECT RETURN DELIVERY OPTION
// PATCH /api/returns/:id/delivery-option
// ============================================================

export const selectReturnDeliveryOption =
  async (req, res) => {
    try {
      console.log(
        "\n========== SELECT RETURN DELIVERY OPTION =========="
      );

      const role =
        getUserRole(req);

      const { id } = req.params;

      const {
        deliveryOption,
      } = req.body;

      // --------------------------------------------------------
      // ROLE
      // --------------------------------------------------------

      if (role !== "VENDOR") {
        return res.status(403).json({
          message:
            "Only vendors can select return delivery option",
        });
      }

      // --------------------------------------------------------
      // OPTION
      // --------------------------------------------------------

      if (
        ![
          "VENDOR_PICKUP",
          "DELIVER_TO_VENDOR",
        ].includes(
          deliveryOption
        )
      ) {
        return res.status(400).json({
          message:
            "Invalid return delivery option",
        });
      }

      // --------------------------------------------------------
      // VENDOR
      // --------------------------------------------------------

      const vendorId =
        await getVendorId(req);

      if (!vendorId) {
        return res.status(403).json({
          message:
            "Vendor account not found",
        });
      }

      // --------------------------------------------------------
      // RETURN
      // --------------------------------------------------------

      const returnRequest =
        await prisma.returnRequest.findUnique({
          where: {
            id: String(id),
          },

          include: {
            shipment: true,
          },
        });

      if (!returnRequest) {
        return res.status(404).json({
          message:
            "Return request not found",
        });
      }

      // --------------------------------------------------------
      // OWNERSHIP
      // --------------------------------------------------------

      if (
        returnRequest.shipment.vendorId !==
        vendorId
      ) {
        return res.status(403).json({
          message:
            "You cannot select delivery option for this return",
        });
      }

      // --------------------------------------------------------
      // WAREHOUSE
      // --------------------------------------------------------

      if (
        returnRequest.status !==
        "IN_WAREHOUSE"
      ) {
        return res.status(400).json({
          message:
            "Delivery option can only be selected when the return is in warehouse.",
        });
      }

      // --------------------------------------------------------
      // ALREADY SELECTED
      // --------------------------------------------------------

      if (
        returnRequest.deliveryOption
      ) {
        return res.status(400).json({
          message:
            "Return delivery option has already been selected.",
        });
      }

      const trackingMessage =
        deliveryOption ===
        "VENDOR_PICKUP"
          ? "Vendor selected warehouse pickup for the returned package"
          : "Vendor selected delivery to vendor address for the returned package";

      // --------------------------------------------------------
      // TRANSACTION
      // --------------------------------------------------------

      const transactionResult =
        await prisma.$transaction(
          async (tx) => {
            const updatedReturn =
              await tx.returnRequest.update({
                where: {
                  id: String(id),
                },

                data: {
                  deliveryOption,
                },

                select: {
                  id: true,
                  shipmentId: true,
                  deliveryOption: true,
                  status: true,
                },
              });

            await tx.tracking.create({
              data: {
                shipmentId:
                  returnRequest.shipmentId,

                status:
                  "RETURN_IN_WAREHOUSE",

                location:
                  "Warehouse",

                message:
                  trackingMessage,

                createdBy:
                  String(
                    req.user?.id ||
                    vendorId
                  ),
              },
            });

            await tx.notification.create({
              data: {
                shipmentId:
                  returnRequest.shipmentId,

                title:
                  "Return Delivery Option Selected",

                message:
                  `Vendor selected ${
                    deliveryOption ===
                    "VENDOR_PICKUP"
                      ? "warehouse pickup"
                      : "delivery to vendor"
                  } for return ${
                    returnRequest
                      .shipment
                      .trackingNumber
                  }`,
              },
            });

            return {
              returnId:
                updatedReturn.id,

              shipmentId:
                updatedReturn.shipmentId,

              deliveryOption:
                updatedReturn.deliveryOption,

              status:
                updatedReturn.status,
            };
          },
          {
            timeout: 15000,
            maxWait: 10000,
          }
        );

      // --------------------------------------------------------
      // FULL RETURN
      // --------------------------------------------------------

      const finalReturn =
        await prisma.returnRequest.findUnique({
          where: {
            id:
              transactionResult.returnId,
          },

          include:
            returnInclude,
        });

      if (!finalReturn) {
        return res.status(404).json({
          message:
            "Delivery option was selected but return could not be loaded",
        });
      }

      return res.status(200).json({
        message:
          "Return delivery option selected successfully",

        returnRequest:
          finalReturn,
      });
    } catch (error) {
      console.error(
        "\n========== SELECT RETURN DELIVERY OPTION ERROR =========="
      );

      console.error(error);

      return res.status(500).json({
        message:
          "Failed to select return delivery option",

        error:
          error?.message ||
          "Unknown server error",

        code:
          error?.code || null,
      });
    }
  };

// ============================================================
// 9. VENDOR CANCEL RETURN
// PATCH /api/returns/:id/cancel
// ============================================================

export const cancelReturn =
  async (req, res) => {
    try {
      const role =
        getUserRole(req);

      if (role !== "VENDOR") {
        return res.status(403).json({
          message:
            "Only vendors can cancel returns",
        });
      }

      const vendorId =
        await getVendorId(req);

      if (!vendorId) {
        return res.status(403).json({
          message:
            "Vendor account not found",
        });
      }

      const returnId =
        String(req.params.id);

      const returnRequest =
        await prisma.returnRequest.findUnique({
          where: {
            id: returnId,
          },

          include: {
            shipment: true,
          },
        });

      if (!returnRequest) {
        return res.status(404).json({
          message:
            "Return request not found",
        });
      }

      if (
        returnRequest.shipment.vendorId !==
        vendorId
      ) {
        return res.status(403).json({
          message:
            "You cannot cancel this return",
        });
      }

      if (
        returnRequest.status !==
          "REQUESTED" &&
        returnRequest.status !==
          "ASSIGNED_TO_RIDER"
      ) {
        return res.status(400).json({
          message:
            "Return can no longer be cancelled",
        });
      }

      const result =
        await prisma.$transaction(
          async (tx) => {
            const updated =
              await tx.returnRequest.update({
                where: {
                  id: returnId,
                },

                data: {
                  status:
                    "CANCELLED",
                },
              });

            await tx.shipment.update({
              where: {
                id:
                  returnRequest.shipmentId,
              },

              data: {
                status:
                  "DELIVERED",
              },
            });

            await tx.tracking.create({
              data: {
                shipmentId:
                  returnRequest.shipmentId,

                status:
                  "DELIVERED",

                location:
                  returnRequest
                    .shipment
                    .receiverAddress ||
                  "Unknown",

                message:
                  "Return request cancelled by vendor",

                createdBy: String(
                  req.user?.id ||
                    vendorId
                ),
              },
            });

            await tx.notification.create({
              data: {
                shipmentId:
                  returnRequest.shipmentId,

                title:
                  "Return Cancelled",

                message:
                  `Return request for ${returnRequest.shipment.trackingNumber} was cancelled`,
              },
            });

            return {
              id: updated.id,
            };
          }
        );

      const finalReturn =
        await prisma.returnRequest.findUnique({
          where: {
            id: result.id,
          },

          include:
            returnInclude,
        });

      return res.json({
        message:
          "Return cancelled successfully",

        returnRequest:
          finalReturn,
      });
    } catch (error) {
      console.error(
        "CANCEL RETURN ERROR:",
        error
      );

      return res.status(500).json({
        message:
          "Failed to cancel return",

        error:
          error.message,
      });
    }
  };