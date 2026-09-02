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
  try {
    const userId = Number(req.user.id);

    // ==================================================
    // FIND VENDOR
    // ==================================================

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

    if (!vendor) {
      return res.status(404).json({
        message: "Vendor not found",
      });
    }

    const vendorId = vendor.id;

    // ==================================================
    // SHIPMENT COUNTS
    // ==================================================

    const [
      totalOrders,
      createdOrders,
      warehouseOrders,
      assignedToRiderOrders,
      outForDeliveryOrders,
      deliveredOrders,
      returnedOrders,
      cancelledOrders,
    ] = await Promise.all([
      // ------------------------------------------------
      // TOTAL SHIPMENTS
      // ------------------------------------------------

      prisma.shipment.count({
        where: {
          vendorId,
        },
      }),

      // ------------------------------------------------
      // CREATED
      // ------------------------------------------------

      prisma.shipment.count({
        where: {
          vendorId,
          status: "CREATED",
        },
      }),

      // ------------------------------------------------
      // IN WAREHOUSE
      // ------------------------------------------------

      prisma.shipment.count({
        where: {
          vendorId,
          status: "IN_WAREHOUSE",
        },
      }),

      // ------------------------------------------------
      // ASSIGNED TO RIDER
      // ------------------------------------------------

      prisma.shipment.count({
        where: {
          vendorId,
          status: "ASSIGNED_TO_RIDER",
        },
      }),

      // ------------------------------------------------
      // OUT FOR DELIVERY
      // ------------------------------------------------

      prisma.shipment.count({
        where: {
          vendorId,
          status: "OUT_FOR_DELIVERY",
        },
      }),

      // ------------------------------------------------
      // DELIVERED
      // ------------------------------------------------

      prisma.shipment.count({
        where: {
          vendorId,
          status: "DELIVERED",
        },
      }),

      // ------------------------------------------------
      // RETURNED TO VENDOR
      // ------------------------------------------------
      //
      // ReturnRequest has its own status.
      // ------------------------------------------------

      prisma.returnRequest.count({
        where: {
          shipment: {
            vendorId,
          },
          status: "RETURNED_TO_VENDOR",
        },
      }),

      // ------------------------------------------------
      // CANCELLED
      // ------------------------------------------------

      prisma.shipment.count({
        where: {
          vendorId,
          status: "CANCELLED",
        },
      }),
    ]);

    // ==================================================
    // FINANCIAL STATISTICS
    // ==================================================

    // --------------------------------------------------
    // TOTAL COD
    // --------------------------------------------------

    const totalCODResult = await prisma.shipment.aggregate({
      _sum: {
        codAmount: true,
      },

      where: {
        vendorId,

        paymentType: "COD",

        status: {
          not: "CANCELLED",
        },
      },
    });

    const totalCOD =
      totalCODResult._sum.codAmount ?? 0;

    // --------------------------------------------------
    // COD COLLECTED
    // --------------------------------------------------

    const codCollectedResult =
      await prisma.shipment.aggregate({
        _sum: {
          codAmount: true,
        },

        where: {
          vendorId,

          paymentType: "COD",

          status: "DELIVERED",
        },
      });

    const codCollected =
      codCollectedResult._sum.codAmount ?? 0;

    // --------------------------------------------------
    // COD PENDING
    // --------------------------------------------------

    const codPending = Math.max(
      Number(totalCOD) - Number(codCollected),
      0
    );

    // --------------------------------------------------
    // TOTAL SHIPPING CHARGES
    // --------------------------------------------------

    const shippingChargesResult =
      await prisma.shipment.aggregate({
        _sum: {
          shippingCharge: true,
        },

        where: {
          vendorId,

          status: {
            not: "CANCELLED",
          },
        },
      });

    const totalShippingCharges =
      shippingChargesResult._sum.shippingCharge ?? 0;

    // --------------------------------------------------
    // DELIVERED SHIPPING CHARGES
    // --------------------------------------------------

    const deliveredShippingChargesResult =
      await prisma.shipment.aggregate({
        _sum: {
          shippingCharge: true,
        },

        where: {
          vendorId,

          status: "DELIVERED",
        },
      });

    const shippingChargesPaid =
      deliveredShippingChargesResult._sum
        .shippingCharge ?? 0;

    // --------------------------------------------------
    // BILL TO PAY
    // --------------------------------------------------

    const billToPay =
      totalShippingCharges;

    // --------------------------------------------------
    // AVERAGE SHIPPING CHARGE
    // --------------------------------------------------

    const averageShippingChargeResult =
      await prisma.shipment.aggregate({
        _avg: {
          shippingCharge: true,
        },

        where: {
          vendorId,

          status: {
            not: "CANCELLED",
          },
        },
      });

    const averageShippingCharge =
      averageShippingChargeResult._avg
        .shippingCharge ?? 0;

    // ==================================================
    // PICKUP STATISTICS
    // ==================================================

    const [
      totalPickups,
      requestedPickups,
      assignedPickups,
      completedPickups,
      cancelledPickups,
    ] = await Promise.all([
      // ------------------------------------------------
      // TOTAL
      // ------------------------------------------------

      prisma.pickup.count({
        where: {
          vendorId,
        },
      }),

      // ------------------------------------------------
      // REQUESTED
      // ------------------------------------------------

      prisma.pickup.count({
        where: {
          vendorId,
          status: "REQUESTED",
        },
      }),

      // ------------------------------------------------
      // ASSIGNED
      // ------------------------------------------------

      prisma.pickup.count({
        where: {
          vendorId,
          status: "ASSIGNED",
        },
      }),

      // ------------------------------------------------
      // COMPLETED
      // ------------------------------------------------

      prisma.pickup.count({
        where: {
          vendorId,
          status: "PICKUP_DONE",
        },
      }),

      // ------------------------------------------------
      // CANCELLED
      // ------------------------------------------------

      prisma.pickup.count({
        where: {
          vendorId,
          status: "CANCELLED",
        },
      }),
    ]);

    // ==================================================
    // RECENT SHIPMENTS
    // ==================================================

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
          // ------------------------------------------------
          // BASIC SHIPMENT INFORMATION
          // ------------------------------------------------

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

          // ------------------------------------------------
          // TRACKING HISTORY
          // ------------------------------------------------

          trackings: {
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
          },

          // ------------------------------------------------
          // RETURN REQUEST
          // ------------------------------------------------
          //
          // IMPORTANT:
          // There is NO returnTrackingNumber.
          //
          // Returns continue using:
          // shipment.trackingNumber
          //
          // ------------------------------------------------

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

                      email: true,
                    },
                  },
                },
              },
            },
          },

          // ------------------------------------------------
          // RIDER
          // ------------------------------------------------

          rider: {
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
          },

          // ------------------------------------------------
          // WAREHOUSE
          // ------------------------------------------------

          warehouse: {
            select: {
              id: true,

              name: true,

              city: true,
            },
          },

          // ------------------------------------------------
          // CARRIER
          // ------------------------------------------------

          carrier: {
            select: {
              id: true,

              name: true,

              phone: true,
            },
          },
        },
      });

    // ==================================================
    // RESPONSE
    // ==================================================

    return res.json({
      // ==================================================
      // VENDOR
      // ==================================================

      vendor: {
        id: vendor.id,

        companyName:
          vendor.companyName,

        contactId:
          vendor.contactId,

        location:
          vendor.location,
      },

      // ==================================================
      // ORDERS
      // ==================================================

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

      // ==================================================
      // FINANCE
      // ==================================================

      finance: {
        totalCOD:
          Number(totalCOD),

        codCollected:
          Number(codCollected),

        codPending:
          Number(codPending),

        totalShippingCharges:
          Number(totalShippingCharges),

        shippingChargesPaid:
          Number(shippingChargesPaid),

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
          Number(totalShippingCharges),
      },

      // ==================================================
      // PICKUPS
      // ==================================================

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

      // ==================================================
      // RECENT SHIPMENTS
      // ==================================================

      recentShipments,
    });
  } catch (err) {
    console.error(
      "VENDOR DASHBOARD ERROR:",
      err
    );

    return res.status(500).json({
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

export const getStaffDashboard = async (
  req,
  res
) => {
  try {
    // ==================================================
    // SHIPMENT COUNTS
    // ==================================================

    const [
      totalShipments,
      created,
      inWarehouse,
      assignedToRider,
      outForDelivery,
      delivered,
      returned,
      cancelled,
      requestedPickups,
      recentShipments,
    ] = await Promise.all([
      // ------------------------------------------------
      // TOTAL
      // ------------------------------------------------

      prisma.shipment.count(),

      // ------------------------------------------------
      // CREATED
      // ------------------------------------------------

      prisma.shipment.count({
        where: {
          status: "CREATED",
        },
      }),

      // ------------------------------------------------
      // IN WAREHOUSE
      // ------------------------------------------------

      prisma.shipment.count({
        where: {
          status: "IN_WAREHOUSE",
        },
      }),

      // ------------------------------------------------
      // ASSIGNED
      // ------------------------------------------------

      prisma.shipment.count({
        where: {
          status: "ASSIGNED_TO_RIDER",
        },
      }),

      // ------------------------------------------------
      // OUT FOR DELIVERY
      // ------------------------------------------------

      prisma.shipment.count({
        where: {
          status: "OUT_FOR_DELIVERY",
        },
      }),

      // ------------------------------------------------
      // DELIVERED
      // ------------------------------------------------

      prisma.shipment.count({
        where: {
          status: "DELIVERED",
        },
      }),

      // ------------------------------------------------
      // RETURNED
      // ------------------------------------------------

      prisma.returnRequest.count({
        where: {
          status: "RETURNED_TO_VENDOR",
        },
      }),

      // ------------------------------------------------
      // CANCELLED
      // ------------------------------------------------

      prisma.shipment.count({
        where: {
          status: "CANCELLED",
        },
      }),

      // ------------------------------------------------
      // REQUESTED PICKUPS
      // ------------------------------------------------

      prisma.pickup.count({
        where: {
          status: "REQUESTED",
        },
      }),

      // ------------------------------------------------
      // RECENT SHIPMENTS
      // ------------------------------------------------

      prisma.shipment.findMany({
        orderBy: {
          createdAt: "desc",
        },

        take: 3,

        select: {
          // ------------------------------------------------
          // SHIPMENT
          // ------------------------------------------------

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

          // ------------------------------------------------
          // RETURN
          // ------------------------------------------------

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

          // ------------------------------------------------
          // VENDOR
          // ------------------------------------------------

          vendor: {
            select: {
              id: true,

              companyName: true,
            },
          },

          // ------------------------------------------------
          // RIDER
          // ------------------------------------------------

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

          // ------------------------------------------------
          // WAREHOUSE
          // ------------------------------------------------

          warehouse: {
            select: {
              id: true,

              name: true,

              city: true,
            },
          },

          // ------------------------------------------------
          // CARRIER
          // ------------------------------------------------

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
    // RESPONSE
    // ==================================================

    return res.json({
      shipments: {
        total:
          totalShipments,

        created,

        inWarehouse,

        assignedToRider,

        outForDelivery,

        delivered,

        returned,

        cancelled,
      },

      pickups: {
        requested:
          requestedPickups,
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

export const getAdminDashboard = async (
  req,
  res
) => {
  try {
    // ==================================================
    // BASIC COUNTS
    // ==================================================

    const [
      // ------------------------------------------------
      // PEOPLE
      // ------------------------------------------------

      totalVendors,
      totalStaff,
      totalRiders,
      activeRiders,
      inactiveRiders,

      // ------------------------------------------------
      // SHIPMENTS
      // ------------------------------------------------

      totalShipments,
      createdShipments,
      inWarehouseShipments,
      assignedToRiderShipments,
      outForDeliveryShipments,
      deliveredShipments,
      returnedShipments,
      cancelledShipments,

      // ------------------------------------------------
      // PICKUPS
      // ------------------------------------------------

      totalPickups,
      requestedPickups,
      assignedPickups,
      completedPickups,
      cancelledPickups,

      // ------------------------------------------------
      // SYSTEM
      // ------------------------------------------------

      totalLocations,
      totalDeliveryTypes,
      totalWarehouses,
      totalCarriers,

      // ------------------------------------------------
      // RECENT SHIPMENTS
      // ------------------------------------------------

      recentShipments,
    ] = await Promise.all([
      // ==================================================
      // PEOPLE
      // ==================================================

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

      // ==================================================
      // SHIPMENTS
      // ==================================================

      prisma.shipment.count(),

      // ------------------------------------------------
      // CREATED
      // ------------------------------------------------

      prisma.shipment.count({
        where: {
          status: "CREATED",
        },
      }),

      // ------------------------------------------------
      // IN WAREHOUSE
      // ------------------------------------------------

      prisma.shipment.count({
        where: {
          status: "IN_WAREHOUSE",
        },
      }),

      // ------------------------------------------------
      // ASSIGNED TO RIDER
      // ------------------------------------------------

      prisma.shipment.count({
        where: {
          status: "ASSIGNED_TO_RIDER",
        },
      }),

      // ------------------------------------------------
      // OUT FOR DELIVERY
      // ------------------------------------------------

      prisma.shipment.count({
        where: {
          status: "OUT_FOR_DELIVERY",
        },
      }),

      // ------------------------------------------------
      // DELIVERED
      // ------------------------------------------------

      prisma.shipment.count({
        where: {
          status: "DELIVERED",
        },
      }),

      // ------------------------------------------------
      // RETURNED TO VENDOR
      // ------------------------------------------------

      prisma.returnRequest.count({
        where: {
          status:
            "RETURNED_TO_VENDOR",
        },
      }),

      // ------------------------------------------------
      // CANCELLED
      // ------------------------------------------------

      prisma.shipment.count({
        where: {
          status: "CANCELLED",
        },
      }),

      // ==================================================
      // PICKUPS
      // ==================================================

      // TOTAL
      prisma.pickup.count(),

      // REQUESTED
      prisma.pickup.count({
        where: {
          status: "REQUESTED",
        },
      }),

      // ASSIGNED
      prisma.pickup.count({
        where: {
          status: "ASSIGNED",
        },
      }),

      // COMPLETED
      prisma.pickup.count({
        where: {
          status: "PICKUP_DONE",
        },
      }),

      // CANCELLED
      prisma.pickup.count({
        where: {
          status: "CANCELLED",
        },
      }),

      // ==================================================
      // SYSTEM
      // ==================================================

      prisma.location.count(),

      prisma.deliveryType.count(),

      prisma.warehouse.count(),

      prisma.carrier.count(),

      // ==================================================
      // RECENT SHIPMENTS
      // ==================================================

      prisma.shipment.findMany({
        orderBy: {
          createdAt: "desc",
        },

        take: 3,

        select: {
          // ------------------------------------------------
          // SHIPMENT
          // ------------------------------------------------

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

          // ------------------------------------------------
          // VENDOR
          // ------------------------------------------------

          vendor: {
            select: {
              id: true,

              companyName: true,
            },
          },

          // ------------------------------------------------
          // RIDER
          // ------------------------------------------------

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

          // ------------------------------------------------
          // RETURN REQUEST
          // ------------------------------------------------
          //
          // IMPORTANT:
          // NO returnTrackingNumber.
          //
          // The shipment's original trackingNumber
          // remains the tracking number for the return.
          //
          // ------------------------------------------------

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

          // ------------------------------------------------
          // WAREHOUSE
          // ------------------------------------------------

          warehouse: {
            select: {
              id: true,

              name: true,

              city: true,
            },
          },

          // ------------------------------------------------
          // CARRIER
          // ------------------------------------------------

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
    // FINANCIAL STATISTICS
    // ==================================================

    // --------------------------------------------------
    // TOTAL COD
    // --------------------------------------------------

    const totalCODResult =
      await prisma.shipment.aggregate({
        _sum: {
          codAmount: true,
        },

        where: {
          paymentType: "COD",

          status: {
            not: "CANCELLED",
          },
        },
      });

    const totalCOD =
      totalCODResult._sum.codAmount ?? 0;

    // --------------------------------------------------
    // COD COLLECTED
    // --------------------------------------------------

    const codCollectedResult =
      await prisma.shipment.aggregate({
        _sum: {
          codAmount: true,
        },

        where: {
          paymentType: "COD",

          status: "DELIVERED",
        },
      });

    const codCollected =
      codCollectedResult._sum.codAmount ?? 0;

    // --------------------------------------------------
    // COD PENDING
    // --------------------------------------------------

    const codPending = Math.max(
      Number(totalCOD) -
        Number(codCollected),
      0
    );

    // --------------------------------------------------
    // TOTAL SHIPPING CHARGES
    // --------------------------------------------------

    const shippingChargesResult =
      await prisma.shipment.aggregate({
        _sum: {
          shippingCharge: true,
        },

        where: {
          status: {
            not: "CANCELLED",
          },
        },
      });

    const totalShippingCharges =
      shippingChargesResult._sum
        .shippingCharge ?? 0;

    // --------------------------------------------------
    // SHIPPING CHARGES COLLECTED
    // --------------------------------------------------

    const shippingChargesCollectedResult =
      await prisma.shipment.aggregate({
        _sum: {
          shippingCharge: true,
        },

        where: {
          status: "DELIVERED",
        },
      });

    const shippingChargesCollected =
      shippingChargesCollectedResult
        ._sum
        .shippingCharge ?? 0;

    // --------------------------------------------------
    // PENDING SHIPPING CHARGES
    // --------------------------------------------------

    const shippingChargesPending =
      Math.max(
        Number(totalShippingCharges) -
          Number(
            shippingChargesCollected
          ),
        0
      );

    // --------------------------------------------------
    // AVERAGE SHIPPING CHARGE
    // --------------------------------------------------

    const averageShippingChargeResult =
      await prisma.shipment.aggregate({
        _avg: {
          shippingCharge: true,
        },

        where: {
          status: {
            not: "CANCELLED",
          },
        },
      });

    const averageShippingCharge =
      averageShippingChargeResult._avg
        .shippingCharge ?? 0;

    // ==================================================
    // RESPONSE
    // ==================================================

    return res.json({
      // ==================================================
      // USERS
      // ==================================================

      users: {
        vendors:
          totalVendors,

        staff:
          totalStaff,

        riders:
          totalRiders,

        activeRiders:
          activeRiders,

        inactiveRiders:
          inactiveRiders,
      },

      // ==================================================
      // SHIPMENTS
      // ==================================================

      shipments: {
        total:
          totalShipments,

        created:
          createdShipments,

        inWarehouse:
          inWarehouseShipments,

        assignedToRider:
          assignedToRiderShipments,

        outForDelivery:
          outForDeliveryShipments,

        delivered:
          deliveredShipments,

        returned:
          returnedShipments,

        cancelled:
          cancelledShipments,
      },

      // ==================================================
      // PICKUPS
      // ==================================================

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

      // ==================================================
      // FINANCE
      // ==================================================

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

        shippingChargesCollected:
          Number(
            shippingChargesCollected
          ),

        shippingChargesPending:
          Number(
            shippingChargesPending
          ),

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

      // ==================================================
      // SYSTEM
      // ==================================================

      system: {
        locations:
          totalLocations,

        deliveryTypes:
          totalDeliveryTypes,

        warehouses:
          totalWarehouses,

        carriers:
          totalCarriers,
      },

      // ==================================================
      // RECENT SHIPMENTS
      // ==================================================

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