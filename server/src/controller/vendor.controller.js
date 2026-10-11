import prisma from "../config/prisma.js";

// ======================================================
// GET ALL VENDORS
// ======================================================

export const getVendors = async (req, res) => {
  try {
    const vendors = await prisma.vendor.findMany({
      include: {
        user: true,
      },
      orderBy: {
        companyName: "asc",
      },
    });

    return res.json(vendors);
  } catch (err) {
    console.error("GET VENDORS ERROR:", err);

    return res.status(500).json({
      message: "Server Error",
    });
  }
};

// ======================================================
// GET VENDOR DASHBOARD
// ======================================================



export const getVendorDashboard = async (req, res) => {
  const requestStart = Date.now();

  // Unique ID for every request
  const requestId = `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;

  try {
    console.log(
      `[${requestId}] ===============================`
    );
    console.log(
      `[${requestId}] VENDOR DASHBOARD START`
    );

    const userId = Number(req.user.id);

    // =========================================================
    // 1. DATABASE PING
    // =========================================================

    let start = Date.now();

    await prisma.$queryRaw`SELECT 1`;

    console.log(
      `[${requestId}] DB PING: ${Date.now() - start}ms`
    );

    // =========================================================
    // 2. FIND VENDOR
    // =========================================================

    start = Date.now();

    const vendor = await prisma.vendor.findUnique({
      where: {
        userId,
      },

      select: {
        id: true,
        companyName: true,
        contactId: true,
        location: true,
      },
    });

    console.log(
      `[${requestId}] VENDOR QUERY: ${Date.now() - start}ms`
    );

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found",
      });
    }

    const vendorId = vendor.id;

    // =========================================================
    // 3. DASHBOARD STATISTICS
    // =========================================================

    const statsStart = Date.now();

    console.log(
      `[${requestId}] DASHBOARD STATS START`
    );

    const [
      shipmentStatusCounts,
      returnedOrders,
      financialTotals,
      deliveredFinancials,
      pickupStatusCounts,
      codTotals,
    ] = await Promise.all([
      // =======================================================
      // SHIPMENT STATUS COUNTS
      // =======================================================

      (async () => {
        const queryStart = Date.now();

        const result =
          await prisma.shipment.groupBy({
            by: ["status"],

            where: {
              vendorId,
            },

            _count: {
              _all: true,
            },
          });

        console.log(
          `[${requestId}] shipment.groupBy: ${
            Date.now() - queryStart
          }ms`
        );

        return result;
      })(),

      // =======================================================
      // RETURN COUNT
      // =======================================================

      (async () => {
        const queryStart = Date.now();

        const result =
          await prisma.returnRequest.count({
            where: {
              shipment: {
                vendorId,
              },

              status:
                "RETURNED_TO_VENDOR",
            },
          });

        console.log(
          `[${requestId}] returnRequest.count: ${
            Date.now() - queryStart
          }ms`
        );

        return result;
      })(),

      // =======================================================
      // SHIPPING FINANCIALS
      // =======================================================

      (async () => {
        const queryStart = Date.now();

        const result =
          await prisma.shipment.aggregate({
            where: {
              vendorId,

              status: {
                not: "CANCELLED",
              },
            },

            _sum: {
              shippingCharge: true,
            },

            _avg: {
              shippingCharge: true,
            },
          });

        console.log(
          `[${requestId}] shipping.aggregate: ${
            Date.now() - queryStart
          }ms`
        );

        return result;
      })(),

      // =======================================================
      // DELIVERED FINANCIALS
      // =======================================================

      (async () => {
        const queryStart = Date.now();

        const result =
          await prisma.shipment.aggregate({
            where: {
              vendorId,

              status: "DELIVERED",
            },

            _sum: {
              codAmount: true,
              shippingCharge: true,
            },
          });

        console.log(
          `[${requestId}] delivered.aggregate: ${
            Date.now() - queryStart
          }ms`
        );

        return result;
      })(),

      // =======================================================
      // PICKUP STATUS
      // =======================================================

      (async () => {
        const queryStart = Date.now();

        const result =
          await prisma.pickup.groupBy({
            by: ["status"],

            where: {
              vendorId,
            },

            _count: {
              _all: true,
            },
          });

        console.log(
          `[${requestId}] pickup.groupBy: ${
            Date.now() - queryStart
          }ms`
        );

        return result;
      })(),

      // =======================================================
      // TOTAL COD
      // =======================================================

      (async () => {
        const queryStart = Date.now();

        const result =
          await prisma.shipment.aggregate({
            where: {
              vendorId,

              paymentType: "COD",

              status: {
                not: "CANCELLED",
              },
            },

            _sum: {
              codAmount: true,
            },
          });

        console.log(
          `[${requestId}] cod.aggregate: ${
            Date.now() - queryStart
          }ms`
        );

        return result;
      })(),
    ]);

    console.log(
      `[${requestId}] ALL DASHBOARD STATS: ${
        Date.now() - statsStart
      }ms`
    );

    // =========================================================
    // 4. SHIPMENT COUNT HELPER
    // =========================================================

    const shipmentCount = (status) => {
      const row =
        shipmentStatusCounts.find(
          (item) =>
            item.status === status
        );

      return row?._count?._all || 0;
    };

    // =========================================================
    // 5. PICKUP COUNT HELPER
    // =========================================================

    const pickupCount = (status) => {
      const row =
        pickupStatusCounts.find(
          (item) =>
            item.status === status
        );

      return row?._count?._all || 0;
    };

    // =========================================================
    // 6. ORDER COUNTS
    // =========================================================

    const totalOrders =
      shipmentStatusCounts.reduce(
        (total, item) =>
          total +
          (item._count?._all || 0),
        0
      );

    const createdOrders =
      shipmentCount("CREATED");

    const warehouseOrders =
      shipmentCount("IN_WAREHOUSE");

    const assignedToRiderOrders =
      shipmentCount(
        "ASSIGNED_TO_RIDER"
      );

    const outForDeliveryOrders =
      shipmentCount(
        "OUT_FOR_DELIVERY"
      );

    const deliveredOrders =
      shipmentCount("DELIVERED");

    const cancelledOrders =
      shipmentCount("CANCELLED");

    // =========================================================
    // 7. FINANCE
    // =========================================================

    const totalCOD =
      codTotals?._sum?.codAmount || 0;

    const codCollected =
      deliveredFinancials?._sum
        ?.codAmount || 0;

    const codPending = Math.max(
      Number(totalCOD) -
        Number(codCollected),
      0
    );

    const totalShippingCharges =
      financialTotals?._sum
        ?.shippingCharge || 0;

    const shippingChargesPaid =
      deliveredFinancials?._sum
        ?.shippingCharge || 0;

    const averageShippingCharge =
      financialTotals?._avg
        ?.shippingCharge || 0;

    const billToPay =
      totalShippingCharges;

    // =========================================================
    // 8. PICKUPS
    // =========================================================

    const totalPickups =
      pickupStatusCounts.reduce(
        (total, item) =>
          total +
          (item._count?._all || 0),
        0
      );

    const requestedPickups =
      pickupCount("REQUESTED");

    const assignedPickups =
      pickupCount("ASSIGNED");

    const completedPickups =
      pickupCount("PICKUP_DONE");

    const cancelledPickups =
      pickupCount("CANCELLED");

    // =========================================================
    // 9. RECENT SHIPMENTS
    // =========================================================

    start = Date.now();

    const recentShipments =
      await prisma.shipment.findMany({
        where: {
          vendorId,
        },

        orderBy: {
          createdAt: "desc",
        },

        take: 10,

        select: {
          id: true,
          trackingNumber: true,

          receiverName: true,
          receiverPhone: true,
          receiverAddress: true,

          packageType: true,
          weight: true,

          paymentType: true,
          codAmount: true,
          shippingCharge: true,

          notes: true,
          qrCode: true,

          status: true,

          origin: true,
          deliveryZone: true,

          vendorId: true,
          riderId: true,
          warehouseId: true,
          carrierId: true,
          locationRateId: true,

          createdAt: true,
          updatedAt: true,
        },
      });

    console.log(
      `[${requestId}] RECENT SHIPMENTS BASE: ${
        Date.now() - start
      }ms`
    );

    // =========================================================
    // 10. NO SHIPMENTS
    // =========================================================

    if (recentShipments.length === 0) {
      console.log(
        `[${requestId}] TOTAL VENDOR DASHBOARD: ${
          Date.now() - requestStart
        }ms`
      );

      return res.json({
        vendor: {
          id: vendor.id,
          companyName:
            vendor.companyName,
          contactId:
            vendor.contactId,
          location:
            vendor.location,
        },

        orders: {
          total: totalOrders,
          pending: createdOrders,
          received: 0,
          processing: 0,
          inWarehouse:
            warehouseOrders,
          dispatched: 0,
          inTransit:
            assignedToRiderOrders,
          arrived: 0,
          outForDelivery:
            outForDeliveryOrders,
          delivered:
            deliveredOrders,
          cancelled:
            cancelledOrders,
          returned:
            returnedOrders,
        },

        finance: {
          totalCOD:
            Number(totalCOD),

          codCollected:
            Number(codCollected),

          codPending:
            Number(codPending),

          totalShippingCharges:
            Number(
              totalShippingCharges
            ),

          shippingChargesPaid:
            Number(
              shippingChargesPaid
            ),

          billToPay:
            Number(billToPay),

          averageShippingCharge:
            Number(
              Number(
                averageShippingCharge
              ).toFixed(2)
            ),

          totalShippingCost:
            null,

          totalRevenue:
            Number(
              totalShippingCharges
            ),
        },

        pickups: {
          total: totalPickups,
          requested:
            requestedPickups,
          assigned:
            assignedPickups,
          completed:
            completedPickups,
          cancelled:
            cancelledPickups,
        },

        recentShipments: [],
      });
    }

    // =========================================================
    // 11. GET RELATED IDS
    // =========================================================

    const shipmentIds =
      recentShipments.map(
        (shipment) => shipment.id
      );

    const riderIds = [
      ...new Set(
        recentShipments
          .map(
            (shipment) =>
              shipment.riderId
          )
          .filter(Boolean)
      ),
    ];

    const warehouseIds = [
      ...new Set(
        recentShipments
          .map(
            (shipment) =>
              shipment.warehouseId
          )
          .filter(Boolean)
      ),
    ];

    const carrierIds = [
      ...new Set(
        recentShipments
          .map(
            (shipment) =>
              shipment.carrierId
          )
          .filter(Boolean)
      ),
    ];

    // =========================================================
    // 12. RELATED DATA
    // =========================================================

    start = Date.now();

    const [
      trackings,
      returnRequests,
      riders,
      warehouses,
      carriers,
    ] = await Promise.all([
      // =======================================================
      // TRACKINGS
      // =======================================================

      prisma.tracking.findMany({
        where: {
          shipmentId: {
            in: shipmentIds,
          },
        },

        orderBy: {
          createdAt: "desc",
        },

        select: {
          id: true,
          shipmentId: true,
          status: true,
          location: true,
          message: true,
          createdBy: true,
          createdAt: true,
        },
      }),

      // =======================================================
      // RETURNS
      // =======================================================

      prisma.returnRequest.findMany({
        where: {
          shipmentId: {
            in: shipmentIds,
          },
        },

        select: {
          id: true,
          shipmentId: true,
          status: true,
          reason: true,
          description: true,
          returnCharge: true,
          requestedAt: true,
          pickedUpAt: true,
          completedAt: true,
          notes: true,
          riderId: true,
        },
      }),

      // =======================================================
      // RIDERS
      // =======================================================

      riderIds.length > 0
        ? prisma.rider.findMany({
            where: {
              id: {
                in: riderIds,
              },
            },

            select: {
              id: true,
              phone: true,
              isAvailable: true,
              latitude: true,
              longitude: true,

              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          })
        : Promise.resolve([]),

      // =======================================================
      // WAREHOUSES
      // =======================================================

      warehouseIds.length > 0
        ? prisma.warehouse.findMany({
            where: {
              id: {
                in: warehouseIds,
              },
            },

            select: {
              id: true,
              name: true,
              city: true,
            },
          })
        : Promise.resolve([]),

      // =======================================================
      // CARRIERS
      // =======================================================

      carrierIds.length > 0
        ? prisma.carrier.findMany({
            where: {
              id: {
                in: carrierIds,
              },
            },

            select: {
              id: true,
              name: true,
              phone: true,
            },
          })
        : Promise.resolve([]),
    ]);

    console.log(
      `[${requestId}] RELATED DATA: ${
        Date.now() - start
      }ms`
    );

    // =========================================================
    // 13. CREATE MAPS
    // =========================================================

    const trackingMap =
      new Map();

    for (const tracking of trackings) {
      if (
        !trackingMap.has(
          tracking.shipmentId
        )
      ) {
        trackingMap.set(
          tracking.shipmentId,
          tracking
        );
      }
    }

    const returnMap =
      new Map();

    for (const returnRequest of returnRequests) {
      returnMap.set(
        returnRequest.shipmentId,
        returnRequest
      );
    }

    const riderMap =
      new Map();

    for (const rider of riders) {
      riderMap.set(
        rider.id,
        rider
      );
    }

    const warehouseMap =
      new Map();

    for (const warehouse of warehouses) {
      warehouseMap.set(
        warehouse.id,
        warehouse
      );
    }

    const carrierMap =
      new Map();

    for (const carrier of carriers) {
      carrierMap.set(
        carrier.id,
        carrier
      );
    }

    // =========================================================
    // 14. BUILD RECENT SHIPMENTS
    // =========================================================

    const finalRecentShipments =
      recentShipments.map(
        (shipment) => {
          const returnRequest =
            returnMap.get(
              shipment.id
            );

          const returnRider =
            returnRequest?.riderId
              ? riderMap.get(
                  returnRequest.riderId
                ) || null
              : null;

          return {
            ...shipment,

            trackings:
              trackingMap.has(
                shipment.id
              )
                ? [
                    trackingMap.get(
                      shipment.id
                    ),
                  ]
                : [],

            returnRequest:
              returnRequest
                ? {
                    ...returnRequest,
                    rider:
                      returnRider,
                  }
                : null,

            rider:
              shipment.riderId
                ? riderMap.get(
                    shipment.riderId
                  ) || null
                : null,

            warehouse:
              shipment.warehouseId
                ? warehouseMap.get(
                    shipment.warehouseId
                  ) || null
                : null,

            carrier:
              shipment.carrierId
                ? carrierMap.get(
                    shipment.carrierId
                  ) || null
                : null,
          };
        }
      );

    // =========================================================
    // 15. FINAL RESPONSE
    // =========================================================

    const response = {
      vendor: {
        id: vendor.id,
        companyName:
          vendor.companyName,
        contactId:
          vendor.contactId,
        location:
          vendor.location,
      },

      orders: {
        total: totalOrders,

        pending:
          createdOrders,

        received: 0,

        processing: 0,

        inWarehouse:
          warehouseOrders,

        dispatched: 0,

        inTransit:
          assignedToRiderOrders,

        arrived: 0,

        outForDelivery:
          outForDeliveryOrders,

        delivered:
          deliveredOrders,

        cancelled:
          cancelledOrders,

        returned:
          returnedOrders,
      },

      finance: {
        totalCOD:
          Number(totalCOD),

        codCollected:
          Number(codCollected),

        codPending:
          Number(codPending),

        totalShippingCharges:
          Number(
            totalShippingCharges
          ),

        shippingChargesPaid:
          Number(
            shippingChargesPaid
          ),

        billToPay:
          Number(billToPay),

        averageShippingCharge:
          Number(
            Number(
              averageShippingCharge
            ).toFixed(2)
          ),

        totalShippingCost:
          null,

        totalRevenue:
          Number(
            totalShippingCharges
          ),
      },

      pickups: {
        total:
          totalPickups,

        requested:
          requestedPickups,

        assigned:
          assignedPickups,

        completed:
          completedPickups,

        cancelled:
          cancelledPickups,
      },

      recentShipments:
        finalRecentShipments,
    };

    // =========================================================
    // 16. TOTAL TIME
    // =========================================================

    console.log(
      `[${requestId}] TOTAL VENDOR DASHBOARD: ${
        Date.now() - requestStart
      }ms`
    );

    console.log(
      `[${requestId}] VENDOR DASHBOARD END`
    );

    console.log(
      `[${requestId}] ===============================`
    );

    return res.json(response);
  } catch (err) {
    console.error(
      `[${requestId}] VENDOR DASHBOARD ERROR:`,
      err
    );

    return res.status(500).json({
      success: false,

      message:
        err instanceof Error
          ? err.message
          : "Failed to load dashboard",
    });
  }
};
// ======================================================
// STAFF DASHBOARD
// ======================================================
export const getStaffDashboard = async (req, res) => {
  try {
    const [
      totalShipments,
      shipmentStatusCounts,
      returned,
      requestedPickups,
      recentShipments,
    ] = await Promise.all([
      // TOTAL
      prisma.shipment.count(),

      // ALL STATUS COUNTS IN ONE QUERY
      prisma.shipment.groupBy({
        by: ["status"],
        _count: {
          _all: true,
        },
      }),

      // RETURNED
      prisma.returnRequest.count({
        where: {
          status: "RETURNED_TO_VENDOR",
        },
      }),

      // PICKUPS
      prisma.pickup.count({
        where: {
          status: "REQUESTED",
        },
      }),

      // RECENT SHIPMENTS
      prisma.shipment.findMany({
        orderBy: {
          createdAt: "desc",
        },
        take: 3,
        select: {
          id: true,
          trackingNumber: true,
          receiverName: true,
          receiverPhone: true,
          receiverAddress: true,
          packageType: true,
          weight: true,
          paymentType: true,
          codAmount: true,
          shippingCharge: true,
          status: true,
          origin: true,
          deliveryZone: true,
          createdAt: true,
          updatedAt: true,

          returnRequest: {
            select: {
              id: true,
              shipmentId: true,
              status: true,
              reason: true,
              description: true,
              returnCharge: true,
              requestedAt: true,
              pickedUpAt: true,
              completedAt: true,
              notes: true,
              riderId: true,

              rider: {
                select: {
                  id: true,
                  phone: true,

                  user: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            },
          },

          vendor: {
            select: {
              id: true,
              companyName: true,
            },
          },

          rider: {
            select: {
              id: true,
              phone: true,

              user: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },

          warehouse: {
            select: {
              id: true,
              name: true,
              city: true,
            },
          },

          carrier: {
            select: {
              id: true,
              name: true,
              phone: true,
            },
          },
        },
      }),
    ]);

    // ==================================================
    // CONVERT STATUS COUNTS
    // ==================================================

    const statusCounts = Object.fromEntries(
      shipmentStatusCounts.map((item) => [
        item.status,
        item._count._all,
      ])
    );

    // ==================================================
    // RESPONSE
    // ==================================================

    return res.json({
      shipments: {
        total: totalShipments,

        created:
          statusCounts.CREATED || 0,

        inWarehouse:
          statusCounts.IN_WAREHOUSE || 0,

        assignedToRider:
          statusCounts.ASSIGNED_TO_RIDER || 0,

        outForDelivery:
          statusCounts.OUT_FOR_DELIVERY || 0,

        delivered:
          statusCounts.DELIVERED || 0,

        returned:
          returned,

        cancelled:
          statusCounts.CANCELLED || 0,
      },

      pickups: {
        requested: requestedPickups,
      },

      recentShipments,
    });
  } catch (err) {
    console.error(
      "STAFF DASHBOARD ERROR:",
      err
    );

    return res.status(500).json({
      message:
        err instanceof Error
          ? err.message
          : "Failed to load staff dashboard",
    });
  }
};
// ======================================================
// ADMIN DASHBOARD
// ======================================================

export const getAdminDashboard = async (req, res) => {
  try {
    // ============================================================
    // 1. READ AND VALIDATE FILTERS
    // ============================================================

    const allowedPeriods = [
      "all",
      "day",
      "today",
      "week",
      "month",
      "year",
      "custom",
    ];

    const period = String(
      req.query.period || "all"
    ).toLowerCase();

    if (!allowedPeriods.includes(period)) {
      return res.status(400).json({
        message:
          "Invalid period. Use all, day, today, week, month, year, or custom.",
      });
    }

    const requestedWarehouseId =
      req.query.warehouseId;

    let warehouseId = null;

    if (
      requestedWarehouseId &&
      requestedWarehouseId !== "all"
    ) {
      warehouseId = Number(requestedWarehouseId);

      if (
        !Number.isSafeInteger(warehouseId) ||
        warehouseId <= 0
      ) {
        return res.status(400).json({
          message: "Invalid warehouse ID.",
        });
      }
    }

    // ============================================================
    // 2. NEPAL TIME HELPERS (UTC +05:45)
    // ============================================================

    const NEPAL_OFFSET_MINUTES = 345;
    const NEPAL_OFFSET_MS =
      NEPAL_OFFSET_MINUTES * 60 * 1000;

    const getNepalDateParts = (date) => {
      const nepalDate = new Date(
        date.getTime() + NEPAL_OFFSET_MS
      );

      return {
        year: nepalDate.getUTCFullYear(),
        month: nepalDate.getUTCMonth(),
        day: nepalDate.getUTCDate(),
      };
    };

    const makeNepalDate = (
      year,
      month,
      day
    ) => {
      // month is zero-based, matching Date.UTC.
      return new Date(
        Date.UTC(year, month, day) -
          NEPAL_OFFSET_MS
      );
    };

    const formatNepalDate = (date) => {
      const parts = getNepalDateParts(date);

      return [
        parts.year,
        String(parts.month + 1).padStart(2, "0"),
        String(parts.day).padStart(2, "0"),
      ].join("-");
    };

    const parseDateInput = (value) => {
      if (
        typeof value !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value)
      ) {
        return null;
      }

      const [year, month, day] =
        value.split("-").map(Number);

      const date = new Date(
        Date.UTC(year, month - 1, day)
      );

      if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
      ) {
        return null;
      }

      return { year, month: month - 1, day };
    };

    const now = new Date();
    const today = getNepalDateParts(now);

    let startDate = null;
    let endDateExclusive = null;

    let startDateLabel = null;
    let endDateLabel = null;

    // ============================================================
    // 3. CALCULATE DATE RANGE
    //
    // The end date is exclusive. For example, selecting October 11
    // includes all records from October 11 in Nepal time.
    // ============================================================

    if (period === "day" || period === "today") {
      startDate = makeNepalDate(
        today.year,
        today.month,
        today.day
      );

      endDateExclusive = makeNepalDate(
        today.year,
        today.month,
        today.day + 1
      );
    } else if (period === "week") {
      // Monday is the first day of the week.
      const todayUtc = new Date(
        Date.UTC(
          today.year,
          today.month,
          today.day
        )
      );

      const dayOfWeek = todayUtc.getUTCDay();

      const daysSinceMonday =
        (dayOfWeek + 6) % 7;

      startDate = makeNepalDate(
        today.year,
        today.month,
        today.day - daysSinceMonday
      );

      endDateExclusive = makeNepalDate(
        today.year,
        today.month,
        today.day - daysSinceMonday + 7
      );
    } else if (period === "month") {
      startDate = makeNepalDate(
        today.year,
        today.month,
        1
      );

      endDateExclusive = makeNepalDate(
        today.year,
        today.month + 1,
        1
      );
    } else if (period === "year") {
      startDate = makeNepalDate(
        today.year,
        0,
        1
      );

      endDateExclusive = makeNepalDate(
        today.year + 1,
        0,
        1
      );
    } else if (period === "custom") {
      const parsedStart = parseDateInput(
        req.query.startDate
      );

      const parsedEnd = parseDateInput(
        req.query.endDate
      );

      if (!parsedStart || !parsedEnd) {
        return res.status(400).json({
          message:
            "Custom date range requires valid startDate and endDate in YYYY-MM-DD format.",
        });
      }

      const startUtc = Date.UTC(
        parsedStart.year,
        parsedStart.month,
        parsedStart.day
      );

      const endUtc = Date.UTC(
        parsedEnd.year,
        parsedEnd.month,
        parsedEnd.day
      );

      if (startUtc > endUtc) {
        return res.status(400).json({
          message:
            "startDate must be before or equal to endDate.",
        });
      }

      startDate = makeNepalDate(
        parsedStart.year,
        parsedStart.month,
        parsedStart.day
      );

      endDateExclusive = makeNepalDate(
        parsedEnd.year,
        parsedEnd.month,
        parsedEnd.day + 1
      );
    }

    if (startDate && endDateExclusive) {
      startDateLabel = formatNepalDate(startDate);

      // The inclusive end date displayed to the user.
      endDateLabel = formatNepalDate(
        new Date(
          endDateExclusive.getTime() -
            24 * 60 * 60 * 1000
        )
      );
    }

    // ============================================================
    // 4. BUILD SHIPMENT FILTER
    //
    // These conditions are reused for shipment statistics,
    // returns related to those shipments, financial totals,
    // and recent shipments.
    // ============================================================

    const shipmentWhere = {};

    if (startDate && endDateExclusive) {
      shipmentWhere.createdAt = {
        gte: startDate,
        lt: endDateExclusive,
      };
    }

    if (warehouseId !== null) {
      shipmentWhere.warehouseId = warehouseId;
    }

    // Pickup has no warehouse relation in the schema shared
    // previously, so its date filtering is separate.
    const pickupWhere = {};

    if (startDate && endDateExclusive) {
      pickupWhere.createdAt = {
        gte: startDate,
        lt: endDateExclusive,
      };
    }

    // ============================================================
    // 5. GET WAREHOUSE OPTIONS
    // ============================================================

    const [
      totalVendors,
      totalStaff,
      totalRiders,
      activeRiders,
      inactiveRiders,

      warehouseOptions,

      shipmentStatusCounts,
      returnedShipments,

      pickupStatusCounts,

      totalLocations,
      totalDeliveryTypes,
      totalWarehouses,
      totalCarriers,

      recentShipments,

      totalCODResult,
      codCollectedResult,
      shippingChargesResult,
      shippingChargesCollectedResult,
      averageShippingChargeResult,
    ] = await Promise.all([
      // ----------------------------------------------------------
      // PEOPLE
      // These are system-wide account totals, not period counts.
      // ----------------------------------------------------------

      prisma.vendor.count(),

      prisma.staff.count(),

      prisma.rider.count(),

      prisma.rider.count({
        where: {
          isAvailable: true,
        },
      }),

      prisma.rider.count({
        where: {
          isAvailable: false,
        },
      }),

      // ----------------------------------------------------------
      // WAREHOUSES
      // ----------------------------------------------------------

      prisma.warehouse.findMany({
        select: {
          id: true,
          name: true,
          city: true,
        },
        orderBy: {
          name: "asc",
        },
      }),

      // ----------------------------------------------------------
      // SHIPMENTS BY STATUS
      // ----------------------------------------------------------

      prisma.shipment.groupBy({
        by: ["status"],
        where: shipmentWhere,
        _count: {
          _all: true,
        },
      }),

      // ----------------------------------------------------------
      // RETURNED SHIPMENTS
      // Count return requests belonging to shipments that match
      // the same date and warehouse filters.
      // ----------------------------------------------------------

      prisma.returnRequest.count({
        where: {
          status: "RETURNED_TO_VENDOR",
          shipment: shipmentWhere,
        },
      }),

      // ----------------------------------------------------------
      // PICKUPS
      // Date-filtered, but not warehouse-filtered because Pickup
      // does not have a warehouseId relation in the shared schema.
      // ----------------------------------------------------------

      prisma.pickup.groupBy({
        by: ["status"],
        where: pickupWhere,
        _count: {
          _all: true,
        },
      }),

      // ----------------------------------------------------------
      // SYSTEM TOTALS
      // These remain system-wide configuration counts.
      // ----------------------------------------------------------

      prisma.location.count(),

      prisma.deliveryType.count(),

      prisma.warehouse.count(),

      prisma.carrier.count(),

      // ----------------------------------------------------------
      // RECENT SHIPMENTS
      // ----------------------------------------------------------

      prisma.shipment.findMany({
        where: shipmentWhere,

        orderBy: {
          createdAt: "desc",
        },

        take: 10,

        select: {
          id: true,
          trackingNumber: true,

          receiverName: true,
          receiverPhone: true,
          receiverAddress: true,

          packageType: true,
          weight: true,

          paymentType: true,
          codAmount: true,
          shippingCharge: true,

          status: true,
          origin: true,
          deliveryZone: true,

          createdAt: true,
          updatedAt: true,

          vendor: {
            select: {
              id: true,
              companyName: true,
            },
          },

          rider: {
            select: {
              id: true,
              phone: true,

              user: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },

          returnRequest: {
            select: {
              id: true,
              shipmentId: true,
              status: true,
              reason: true,
              description: true,
              returnCharge: true,
              requestedAt: true,
              pickedUpAt: true,
              completedAt: true,
              notes: true,
              riderId: true,

              rider: {
                select: {
                  id: true,
                  phone: true,

                  user: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            },
          },

          warehouse: {
            select: {
              id: true,
              name: true,
              city: true,
            },
          },

          carrier: {
            select: {
              id: true,
              name: true,
              phone: true,
            },
          },
        },
      }),

      // ----------------------------------------------------------
      // TOTAL COD
      // ----------------------------------------------------------

      prisma.shipment.aggregate({
        where: {
          ...shipmentWhere,

          paymentType: "COD",

          status: {
            not: "CANCELLED",
          },
        },

        _sum: {
          codAmount: true,
        },
      }),

      // ----------------------------------------------------------
      // COD COLLECTED
      // ----------------------------------------------------------

      prisma.shipment.aggregate({
        where: {
          ...shipmentWhere,

          paymentType: "COD",

          status: "DELIVERED",
        },

        _sum: {
          codAmount: true,
        },
      }),

      // ----------------------------------------------------------
      // SHIPPING CHARGES
      // ----------------------------------------------------------

      prisma.shipment.aggregate({
        where: {
          ...shipmentWhere,

          status: {
            not: "CANCELLED",
          },
        },

        _sum: {
          shippingCharge: true,
        },
      }),

      // ----------------------------------------------------------
      // SHIPPING CHARGES COLLECTED
      // ----------------------------------------------------------

      prisma.shipment.aggregate({
        where: {
          ...shipmentWhere,

          status: "DELIVERED",
        },

        _sum: {
          shippingCharge: true,
        },
      }),

      // ----------------------------------------------------------
      // AVERAGE SHIPPING CHARGE
      // ----------------------------------------------------------

      prisma.shipment.aggregate({
        where: {
          ...shipmentWhere,

          status: {
            not: "CANCELLED",
          },
        },

        _avg: {
          shippingCharge: true,
        },
      }),
    ]);

    // ============================================================
    // 6. CONVERT SHIPMENT STATUS COUNTS
    // ============================================================

    const statusCounts = Object.fromEntries(
      shipmentStatusCounts.map((item) => [
        item.status,
        item._count._all,
      ])
    );

    const totalShipments =
      shipmentStatusCounts.reduce(
        (total, item) =>
          total + item._count._all,
        0
      );

    const createdShipments =
      statusCounts.CREATED || 0;

    const inWarehouseShipments =
      statusCounts.IN_WAREHOUSE || 0;

    const assignedToRiderShipments =
      statusCounts.ASSIGNED_TO_RIDER || 0;

    const outForDeliveryShipments =
      statusCounts.OUT_FOR_DELIVERY || 0;

    const deliveredShipments =
      statusCounts.DELIVERED || 0;

    const cancelledShipments =
      statusCounts.CANCELLED || 0;

    // ============================================================
    // 7. CONVERT PICKUP STATUS COUNTS
    // ============================================================

    const pickupCounts = Object.fromEntries(
      pickupStatusCounts.map((item) => [
        item.status,
        item._count._all,
      ])
    );

    const totalPickups =
      pickupStatusCounts.reduce(
        (total, item) =>
          total + item._count._all,
        0
      );

    const requestedPickups =
      pickupCounts.REQUESTED || 0;

    const assignedPickups =
      pickupCounts.ASSIGNED || 0;

    const completedPickups =
      pickupCounts.PICKUP_DONE || 0;

    const cancelledPickups =
      pickupCounts.CANCELLED || 0;

    // ============================================================
    // 8. FINANCIAL CALCULATIONS
    // ============================================================

    const totalCOD = Number(
      totalCODResult._sum.codAmount ?? 0
    );

    const codCollected = Number(
      codCollectedResult._sum.codAmount ?? 0
    );

    const codPending = Math.max(
      totalCOD - codCollected,
      0
    );

    const totalShippingCharges = Number(
      shippingChargesResult._sum
        .shippingCharge ?? 0
    );

    const shippingChargesCollected = Number(
      shippingChargesCollectedResult._sum
        .shippingCharge ?? 0
    );

    const shippingChargesPending = Math.max(
      totalShippingCharges -
        shippingChargesCollected,
      0
    );

    const averageShippingCharge = Number(
      Number(
        averageShippingChargeResult._avg
          .shippingCharge ?? 0
      ).toFixed(2)
    );

    // ============================================================
    // 9. FILTER METADATA
    // ============================================================

    const filters = {
      period,

      startDate: startDateLabel,

      endDate: endDateLabel,

      warehouseId:
        warehouseId === null
          ? "all"
          : warehouseId,
    };

    // ============================================================
    // 10. RESPONSE
    //
    // Existing top-level keys are retained so the current
    // dashboard can continue using its existing data structure.
    // ============================================================

    return res.status(200).json({
      filters,

      warehouses: warehouseOptions,

      users: {
        vendors: totalVendors,
        staff: totalStaff,
        riders: totalRiders,
        activeRiders,
        inactiveRiders,
      },

      shipments: {
        total: totalShipments,
        created: createdShipments,
        inWarehouse: inWarehouseShipments,
        assignedToRider: assignedToRiderShipments,
        outForDelivery: outForDeliveryShipments,
        delivered: deliveredShipments,
        returned: returnedShipments,
        cancelled: cancelledShipments,
      },

      pickups: {
        total: totalPickups,
        requested: requestedPickups,
        assigned: assignedPickups,
        completed: completedPickups,
        cancelled: cancelledPickups,
      },

      finance: {
        totalCOD,
        codCollected,
        codPending,

        totalShippingCharges,

        shippingChargesCollected,

        shippingChargesPending,

        averageShippingCharge,

        totalShippingCost: null,

        totalRevenue: totalShippingCharges,
      },

      system: {
        locations: totalLocations,
        deliveryTypes: totalDeliveryTypes,
        warehouses: totalWarehouses,
        carriers: totalCarriers,
      },

      recentShipments,
    });
  } catch (err) {
    console.error(
      "ADMIN DASHBOARD ERROR:",
      err
    );

    return res.status(500).json({
      message:
        err instanceof Error
          ? err.message
          : "Failed to load admin dashboard",
    });
  }
};
