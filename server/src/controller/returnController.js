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

    if (
      !["ADMIN", "STAFF"].includes(
        role
      )
    ) {
      return res.status(403).json({
        message:
          "Only admin or staff can view all returns",
      });
    }

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
    console.log(
      "\n========== ASSIGN RETURN RIDER =========="
    );

    console.log("USER:", req.user);
    console.log("PARAMS:", req.params);
    console.log("BODY:", req.body);

    const role = getUserRole(req);

    console.log("ROLE:", role);

    // ----------------------------------------------------------
    // ROLE CHECK
    // ----------------------------------------------------------

    if (!["ADMIN", "STAFF"].includes(role)) {
      return res.status(403).json({
        message:
          "Only admin or staff can assign return riders",
      });
    }

    // ----------------------------------------------------------
    // RETURN ID
    // ----------------------------------------------------------

    const returnId = String(req.params.id);

    if (!returnId) {
      return res.status(400).json({
        message: "Return ID is required",
      });
    }

    // ----------------------------------------------------------
    // RIDER ID
    // ----------------------------------------------------------

    const riderId = Number(req.body.riderId);

    console.log("RETURN ID:", returnId);
    console.log("RIDER ID:", riderId);

    if (!Number.isInteger(riderId)) {
      return res.status(400).json({
        message: "Valid rider ID is required",
      });
    }

    // ----------------------------------------------------------
    // FIND RETURN
    // ----------------------------------------------------------

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
        message: "Return request not found",
      });
    }

    console.log(
      "RETURN STATUS:",
      returnRequest.status
    );

    console.log(
      "SHIPMENT ID:",
      returnRequest.shipmentId
    );

    // ----------------------------------------------------------
    // ONLY REQUESTED RETURNS CAN BE ASSIGNED
    // ----------------------------------------------------------

    if (
      returnRequest.status !==
      "REQUESTED"
    ) {
      return res.status(400).json({
        message:
          `Cannot assign rider. Return is currently ${returnRequest.status}`,
      });
    }

    // ----------------------------------------------------------
    // FIND RIDER
    // ----------------------------------------------------------

    const rider =
      await prisma.rider.findUnique({
        where: {
          id: riderId,
        },

        include: {
          user: true,
        },
      });

    console.log(
      "RIDER FOUND:",
      !!rider
    );

    if (!rider) {
      return res.status(404).json({
        message: "Rider not found",
      });
    }

    console.log("RIDER:", rider);

    // ----------------------------------------------------------
    // TRANSACTION
    //
    // IMPORTANT:
    // Do NOT fetch returnRequest again inside this transaction.
    // The final findUnique was causing P2028 because the
    // interactive transaction exceeded Prisma's 5 second timeout.
    // ----------------------------------------------------------

    const transactionResult =
      await prisma.$transaction(
        async (tx) => {
          console.log(
            "STARTING TRANSACTION"
          );

          // ----------------------------------------------------
          // UPDATE RETURN
          // ----------------------------------------------------

          const updatedReturn =
            await tx.returnRequest.update({
              where: {
                id: returnId,
              },

              data: {
                riderId: rider.id,

                status:
                  "ASSIGNED_TO_RIDER",
              },

              select: {
                id: true,
                shipmentId: true,
              },
            });

          console.log(
            "RETURN UPDATED:",
            updatedReturn.id
          );

          // ----------------------------------------------------
          // UPDATE SHIPMENT
          // ----------------------------------------------------

          await tx.shipment.update({
            where: {
              id:
                returnRequest.shipmentId,
            },

            data: {
              status:
                "RETURN_ASSIGNED_TO_RIDER",
            },
          });

          console.log(
            "SHIPMENT UPDATED"
          );

          // ----------------------------------------------------
          // CREATE TRACKING
          //
          // Same shipment.
          // Same original tracking number.
          // NO new return tracking number.
          // ----------------------------------------------------

          await tx.tracking.create({
            data: {
              shipmentId:
                returnRequest.shipmentId,

              status:
                "RETURN_ASSIGNED_TO_RIDER",

              location:
                returnRequest
                  .shipment
                  .receiverAddress ||
                "Unknown",

              message:
                `Return assigned to rider ${
                  rider.user?.name ||
                  rider.id
                }`,

              createdBy: String(
                req.user?.id || ""
              ),
            },
          });

          console.log(
            "TRACKING CREATED"
          );

          // ----------------------------------------------------
          // NOTIFICATION
          // ----------------------------------------------------

          await tx.notification.create({
            data: {
              shipmentId:
                returnRequest.shipmentId,

              title:
                "Return Rider Assigned",

              message:
                `Return for shipment ${
                  returnRequest.shipment
                    .trackingNumber
                } has been assigned to ${
                  rider.user?.name ||
                  "a rider"
                }`,
            },
          });

          console.log(
            "NOTIFICATION CREATED"
          );

          // ----------------------------------------------------
          // ONLY RETURN SIMPLE DATA FROM TRANSACTION
          // ----------------------------------------------------

          return {
            returnId:
              updatedReturn.id,

            shipmentId:
              updatedReturn.shipmentId,
          };
        }
      );

    console.log(
      "TRANSACTION COMPLETE"
    );

    // ==========================================================
    // FETCH FULL RETURN AFTER TRANSACTION
    //
    // This query is intentionally OUTSIDE the transaction.
    // Therefore it cannot hit the 5-second interactive
    // transaction timeout.
    // ==========================================================

    const finalReturn =
      await prisma.returnRequest.findUnique({
        where: {
          id:
            transactionResult.returnId,
        },

        include:
          returnInclude,
      });

    // ----------------------------------------------------------
    // SAFETY CHECK
    // ----------------------------------------------------------

    if (!finalReturn) {
      return res.status(404).json({
        message:
          "Return was assigned but could not be loaded",
      });
    }

    // ----------------------------------------------------------
    // SUCCESS
    // ----------------------------------------------------------

    return res.status(200).json({
      message:
        "Return rider assigned successfully",

      returnRequest:
        finalReturn,
    });
  } catch (error) {
    console.error(
      "\n========== ASSIGN RETURN RIDER ERROR =========="
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
        "Failed to assign return rider",

      error:
        error?.message ||
        "Unknown server error",

      code:
        error?.code || null,
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