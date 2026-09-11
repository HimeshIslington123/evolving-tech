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

  CANCELLED: "DELIVERED",
};

// ============================================================
// RETURN STATUS TRANSITIONS
// ============================================================

const allowedTransitions = {
  REQUESTED: [
    "ASSIGNED_TO_RIDER",
    "CANCELLED",
  ],

  ASSIGNED_TO_RIDER: [
    "PICKED_UP_FROM_CUSTOMER",
    "CANCELLED",
  ],

  PICKED_UP_FROM_CUSTOMER: [
    "IN_WAREHOUSE",
  ],

  IN_WAREHOUSE: [
    "OUT_FOR_RETURN",
  ],

  OUT_FOR_RETURN: [
    "RETURNED_TO_VENDOR",
  ],

  RETURNED_TO_VENDOR: [],

  CANCELLED: [],
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

export const createReturnRequest = async (
  req,
  res
) => {
  try {
    const role = getUserRole(req);

    if (role !== "VENDOR") {
      return res.status(403).json({
        message:
          "Only vendors can request a return",
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

    const {
      shipmentId,
      reason,
      description,
      notes,
    } = req.body;

    // ----------------------------------------------------------
    // VALIDATION
    // ----------------------------------------------------------

    if (!shipmentId) {
      return res.status(400).json({
        message:
          "Shipment ID is required",
      });
    }

    if (!reason) {
      return res.status(400).json({
        message:
          "Return reason is required",
      });
    }

    if (
      !validReturnReasons.includes(
        reason
      )
    ) {
      return res.status(400).json({
        message:
          "Invalid return reason",
      });
    }

    // ----------------------------------------------------------
    // FIND SHIPMENT
    // ----------------------------------------------------------

    const shipment =
      await prisma.shipment.findFirst({
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
        message:
          "Shipment not found",
      });
    }

    // ----------------------------------------------------------
    // ONLY DELIVERED
    // ----------------------------------------------------------

    if (
      shipment.status !==
      "DELIVERED"
    ) {
      return res.status(400).json({
        message:
          "Return can only be requested after shipment is delivered",
      });
    }

    // ----------------------------------------------------------
    // DUPLICATE
    // ----------------------------------------------------------

    if (shipment.returnRequest) {
      return res.status(400).json({
        message:
          "A return request already exists for this shipment",

        returnRequest:
          shipment.returnRequest,
      });
    }

    // ----------------------------------------------------------
    // TRANSACTION
    // ----------------------------------------------------------

    const result =
      await prisma.$transaction(
        async (tx) => {
          const returnRequest =
            await tx.returnRequest.create({
              data: {
                shipmentId:
                  shipment.id,

                status:
                  "REQUESTED",

                reason,

                description:
                  description?.trim() ||
                  null,

                notes:
                  notes?.trim() ||
                  null,

                returnCharge: 0,
              },
            });

          // ----------------------------------------------------
          // SHIPMENT
          // ----------------------------------------------------

          await tx.shipment.update({
            where: {
              id: shipment.id,
            },

            data: {
              status:
                "RETURN_REQUESTED",
            },
          });

          // ----------------------------------------------------
          // TRACKING
          // ----------------------------------------------------

          await tx.tracking.create({
            data: {
              shipmentId:
                shipment.id,

              status:
                "RETURN_REQUESTED",

              location:
                shipment.receiverAddress ||
                shipment.deliveryZone ||
                "Unknown",

              message:
                "Vendor requested a return for this shipment",

              createdBy: String(
                req.user?.id ||
                  vendorId
              ),
            },
          });

          // ----------------------------------------------------
          // NOTIFICATION
          // ----------------------------------------------------

          await tx.notification.create({
            data: {
              shipmentId:
                shipment.id,

              title:
                "Return Requested",

              message:
                `Return requested for shipment ${shipment.trackingNumber}`,
            },
          });

          // ----------------------------------------------------
          // RETURN WITH RELATIONS
          // ----------------------------------------------------

          return tx.returnRequest.findUnique({
            where: {
              id: returnRequest.id,
            },

            include:
              returnInclude,
          });
        }
      );

    return res.status(201).json({
      message:
        "Return request created successfully",

      returnRequest: result,
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

export const getMyReturns = async (
  req,
  res
) => {
  try {
    const role = getUserRole(req);

    if (role !== "VENDOR") {
      return res.status(403).json({
        message:
          "Only vendors can access their returns",
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

    const returns =
      await prisma.returnRequest.findMany({
        where: {
          shipment: {
            vendorId,
          },
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

export const getAllReturns = async (
  req,
  res
) => {
  try {
    const role = getUserRole(req);


    const returns =
      await prisma.returnRequest.findMany({
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

export const getReturnById = async (
  req,
  res
) => {
  try {
    const returnId =
      String(req.params.id);

    const returnRequest =
      await prisma.returnRequest.findUnique({
        where: {
          id: returnId,
        },

        include:
          returnInclude,
      });

    if (!returnRequest) {
      return res.status(404).json({
        message:
          "Return request not found",
      });
    }

    const role = getUserRole(req);

    // ----------------------------------------------------------
    // VENDOR
    // ----------------------------------------------------------

    if (role === "VENDOR") {
      const vendorId =
        await getVendorId(req);

      if (
        returnRequest.shipment
          .vendorId !== vendorId
      ) {
        return res.status(403).json({
          message:
            "You cannot view this return",
        });
      }
    }

    // ----------------------------------------------------------
    // RIDER
    // ----------------------------------------------------------

    if (role === "RIDER") {
      const riderId =
        await getRiderId(req);

      if (
        returnRequest.riderId !==
        riderId
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

export const assignReturnRider = async (req, res) => {
  try {
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

    // ------------------------------------------------------------
    // FIND RETURN
    // ------------------------------------------------------------

    const returnRequest = await prisma.returnRequest.findUnique({
      where: {
        id,
      },
    });

    if (!returnRequest) {
      return res.status(404).json({
        message: "Return request not found",
      });
    }

    // ------------------------------------------------------------
    // CHECK RIDER
    // ------------------------------------------------------------

    const rider = await prisma.rider.findUnique({
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

    // ------------------------------------------------------------
    // REQUESTED
    //
    // This is the ORIGINAL CUSTOMER PICKUP RIDER.
    // ------------------------------------------------------------

    if (returnRequest.status === "REQUESTED") {
      const updatedReturn = await prisma.returnRequest.update({
        where: {
          id,
        },
        data: {
          riderId: numericRiderId,
          status: "ASSIGNED_TO_RIDER",
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
        message: "Pickup rider assigned successfully",
        returnRequest: updatedReturn,
      });
    }

    // ------------------------------------------------------------
    // IN WAREHOUSE + DELIVER TO VENDOR
    //
    // This is the NEW rider.
    // DO NOT overwrite riderId.
    // ------------------------------------------------------------

    if (
      returnRequest.status === "IN_WAREHOUSE" &&
      returnRequest.deliveryOption === "DELIVER_TO_VENDOR"
    ) {
      const updatedReturn = await prisma.returnRequest.update({
        where: {
          id,
        },
        data: {
          returnDeliveryRiderId: numericRiderId,
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
        message: "Return delivery rider assigned successfully",
        returnRequest: updatedReturn,
      });
    }

    // ------------------------------------------------------------
    // VENDOR PICKUP DOES NOT NEED RIDER
    // ------------------------------------------------------------

    if (
      returnRequest.status === "IN_WAREHOUSE" &&
      returnRequest.deliveryOption === "VENDOR_PICKUP"
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
    console.error("Assign return rider error:", error);

    return res.status(500).json({
      message: "Failed to assign rider",
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
            riderId,
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

export const updateReturnStatus =
  async (req, res) => {
    try {
      console.log(
        "\n========== UPDATE RETURN STATUS =========="
      );

      const role =
        getUserRole(req);

      console.log("ROLE:", role);
      console.log("PARAMS:", req.params);
      console.log("BODY:", req.body);

      // --------------------------------------------------------
      // ROLE CHECK
      // --------------------------------------------------------

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

      // --------------------------------------------------------
      // RETURN ID
      // --------------------------------------------------------

      const returnId =
        String(req.params.id);

      if (!returnId) {
        return res.status(400).json({
          message:
            "Return ID is required",
        });
      }

      // --------------------------------------------------------
      // BODY
      // --------------------------------------------------------

      const {
        status,
        location,
        notes,
      } = req.body;

      // --------------------------------------------------------
      // STATUS VALIDATION
      // --------------------------------------------------------

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

      // --------------------------------------------------------
      // FIND RETURN
      // --------------------------------------------------------

      const returnRequest =
        await prisma.returnRequest.findUnique({
          where: {
            id: returnId,
          },

          include: {
            shipment: true,
          },
        });

      console.log(
        "RETURN FOUND:",
        !!returnRequest
      );

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
        "NEW STATUS:",
        status
      );

      console.log(
        "SHIPMENT ID:",
        returnRequest.shipmentId
      );

      // --------------------------------------------------------
      // RIDER CHECK
      // --------------------------------------------------------

      if (role === "RIDER") {
        const riderId =
          await getRiderId(req);

        console.log(
          "RIDER ID:",
          riderId
        );

        console.log(
          "ASSIGNED RIDER ID:",
          returnRequest.riderId
        );

        if (!riderId) {
          return res.status(403).json({
            message:
              "Rider account not found",
          });
        }

        if (
          returnRequest.riderId !==
          riderId
        ) {
          return res.status(403).json({
            message:
              "This return is not assigned to you",
          });
        }

        // ------------------------------------------------------
        // RIDER CAN ONLY HANDLE THESE RETURN STEPS
        // ------------------------------------------------------

        const riderAllowedStatuses = [
          "PICKED_UP_FROM_CUSTOMER",
          "IN_WAREHOUSE",
        ];

        if (
          !riderAllowedStatuses.includes(
            status
          )
        ) {
          return res.status(403).json({
            message:
              "Rider cannot update return to this status",
          });
        }
      }

      // --------------------------------------------------------
      // SAME STATUS
      // --------------------------------------------------------

      if (
        returnRequest.status ===
        status
      ) {
        return res.status(400).json({
          message:
            `Return is already ${status}`,
        });
      }

      // --------------------------------------------------------
      // TRANSITION CHECK
      // --------------------------------------------------------

      if (
        !allowedTransitions[
          returnRequest.status
        ]?.includes(status)
      ) {
        return res.status(400).json({
          message:
            `Cannot change return status from ${returnRequest.status} to ${status}`,
        });
      }

      // --------------------------------------------------------
      // UPDATE DATA
      // --------------------------------------------------------

      const updateData = {
        status,
      };

      // --------------------------------------------------------
      // NOTES
      // --------------------------------------------------------

      if (
        notes !== undefined
      ) {
        updateData.notes =
          notes?.trim() || null;
      }

      // --------------------------------------------------------
      // PICKED UP FROM CUSTOMER
      // --------------------------------------------------------

      if (
        status ===
          "PICKED_UP_FROM_CUSTOMER" &&
        !returnRequest.pickedUpAt
      ) {
        updateData.pickedUpAt =
          new Date();
      }

      // --------------------------------------------------------
      // RETURNED TO VENDOR
      // --------------------------------------------------------

      if (
        status ===
          "RETURNED_TO_VENDOR" &&
        !returnRequest.completedAt
      ) {
        updateData.completedAt =
          new Date();
      }

      // --------------------------------------------------------
      // SHIPMENT STATUS
      // --------------------------------------------------------

      const shipmentStatus =
        shipmentStatusMap[status];

      if (!shipmentStatus) {
        return res.status(400).json({
          message:
            "No shipment status mapping found",
        });
      }

      // --------------------------------------------------------
      // TRACKING MESSAGE
      // --------------------------------------------------------

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

      // --------------------------------------------------------
      // TRACKING STATUS
      // --------------------------------------------------------
      //
      // IMPORTANT:
      // For return tracking we use the RETURN_* status.
      // Do not use the normal IN_WAREHOUSE status.
      //
      // --------------------------------------------------------

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

      // --------------------------------------------------------
      // TRANSACTION
      // --------------------------------------------------------
      //
      // IMPORTANT:
      // DO NOT do:
      //
      // tx.returnRequest.findUnique(...)
      //
      // at the end of this transaction.
      //
      // That was causing P2028.
      //
      // --------------------------------------------------------

      console.log(
        "STARTING TRANSACTION"
      );

      const transactionResult =
        await prisma.$transaction(
          async (tx) => {

            // --------------------------------------------------
            // UPDATE RETURN
            // --------------------------------------------------

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
                },
              });

            console.log(
              "RETURN UPDATED:",
              updatedReturn.id
            );

            // --------------------------------------------------
            // UPDATE SHIPMENT
            // --------------------------------------------------

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

            console.log(
              "SHIPMENT UPDATED:",
              shipmentStatus
            );

            // --------------------------------------------------
            // CREATE TRACKING
            // --------------------------------------------------

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

            console.log(
              "TRACKING CREATED:",
              trackingStatus
            );

            // --------------------------------------------------
            // CREATE NOTIFICATION
            // --------------------------------------------------

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

            console.log(
              "NOTIFICATION CREATED"
            );

            // --------------------------------------------------
            // RETURN ONLY SIMPLE DATA
            // --------------------------------------------------

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

      console.log(
        "TRANSACTION COMPLETE"
      );

      console.log(
        "TRANSACTION RESULT:",
        transactionResult
      );

      // ========================================================
      // FETCH FULL RETURN AFTER TRANSACTION
      // ========================================================
      //
      // IMPORTANT:
      // This is now using normal `prisma`.
      //
      // The transaction is already finished.
      //
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

      // --------------------------------------------------------
      // SAFETY CHECK
      // --------------------------------------------------------

      if (!finalReturn) {
        return res.status(404).json({
          message:
            "Return status was updated but return could not be loaded",
        });
      }

      // --------------------------------------------------------
      // SUCCESS
      // --------------------------------------------------------

      console.log(
        "FINAL RETURN FETCHED"
      );

      console.log(
        "FINAL STATUS:",
        finalReturn.status
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

      console.error(
        "ERROR:",
        error
      );

      console.error(
        "MESSAGE:",
        error?.message
      );

      console.error(
        "CODE:",
        error?.code
      );

      console.error(
        "META:",
        error?.meta
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
// SELECT RETURN DELIVERY OPTION
// PATCH /api/returns/:id/delivery-option
// ============================================================

export const selectReturnDeliveryOption = async (req, res) => {
  try {
    console.log(
      "\n========== SELECT RETURN DELIVERY OPTION =========="
    );

    const role = getUserRole(req);

    const { id } = req.params;
    const { deliveryOption } = req.body;

    // ----------------------------------------------------------
    // ROLE CHECK
    // ----------------------------------------------------------

    if (role !== "VENDOR") {
      return res.status(403).json({
        message:
          "Only vendors can select return delivery option",
      });
    }

    // ----------------------------------------------------------
    // VALIDATE DELIVERY OPTION
    // ----------------------------------------------------------

    if (
      ![
        "VENDOR_PICKUP",
        "DELIVER_TO_VENDOR",
      ].includes(deliveryOption)
    ) {
      return res.status(400).json({
        message:
          "Invalid return delivery option",
      });
    }

    // ----------------------------------------------------------
    // GET VENDOR
    // ----------------------------------------------------------

    const vendorId = await getVendorId(req);

    if (!vendorId) {
      return res.status(403).json({
        message:
          "Vendor account not found",
      });
    }

    // ----------------------------------------------------------
    // FIND RETURN
    // ----------------------------------------------------------

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

    // ----------------------------------------------------------
    // VENDOR OWNERSHIP CHECK
    // ----------------------------------------------------------

    if (
      returnRequest.shipment.vendorId !==
      vendorId
    ) {
      return res.status(403).json({
        message:
          "You cannot select delivery option for this return",
      });
    }

    // ----------------------------------------------------------
    // MUST BE IN WAREHOUSE
    // ----------------------------------------------------------

    if (
      returnRequest.status !==
      "IN_WAREHOUSE"
    ) {
      return res.status(400).json({
        message:
          "Delivery option can only be selected when the return is in warehouse.",
      });
    }

    // ----------------------------------------------------------
    // PREVENT CHANGING OPTION
    // ----------------------------------------------------------

    if (
      returnRequest.deliveryOption
    ) {
      return res.status(400).json({
        message:
          "Return delivery option has already been selected.",
      });
    }

    // ----------------------------------------------------------
    // TRACKING MESSAGE
    // ----------------------------------------------------------

    const trackingMessage =
      deliveryOption ===
      "VENDOR_PICKUP"
        ? "Vendor selected warehouse pickup for the returned package"
        : "Vendor selected delivery to vendor address for the returned package";

    // ----------------------------------------------------------
    // TRANSACTION
    // ----------------------------------------------------------

    const transactionResult =
      await prisma.$transaction(
        async (tx) => {

          // ----------------------------------------------------
          // UPDATE RETURN DELIVERY OPTION
          // ----------------------------------------------------

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

          // ----------------------------------------------------
          // CREATE TRACKING
          //
          // IMPORTANT:
          // We keep the SAME shipmentId.
          //
          // This means the event appears in the existing
          // shipment tracking history.
          // ----------------------------------------------------

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

          // ----------------------------------------------------
          // NOTIFICATION
          // ----------------------------------------------------

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
                } for return ${returnRequest.shipment.trackingNumber}`,
            },
          });

          // ----------------------------------------------------
          // RETURN SIMPLE DATA
          // ----------------------------------------------------

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

    // ----------------------------------------------------------
    // FETCH FULL RETURN AFTER TRANSACTION
    // ----------------------------------------------------------

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

    // ----------------------------------------------------------
    // SUCCESS
    // ----------------------------------------------------------

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

    console.error(
      "ERROR:",
      error
    );

    console.error(
      "MESSAGE:",
      error?.message
    );

    console.error(
      "CODE:",
      error?.code
    );

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
// 8. VENDOR CANCEL RETURN
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
        returnRequest.shipment
          .vendorId !== vendorId
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

            return tx.returnRequest.findUnique({
              where: {
                id: returnId,
              },

              include:
                returnInclude,
            });
          }
        );

      return res.json({
        message:
          "Return cancelled successfully",

        returnRequest: result,
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