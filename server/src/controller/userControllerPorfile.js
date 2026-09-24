import bcrypt from "bcrypt";
import prisma from "../config/prisma.js";
import { z } from "zod";


// ======================================================
// GET USER DETAILS
// GET /api/users/:id/details
// ======================================================

const getUserDetails = async (req, res) => {
  try {
    const userId = Number(req.params.id);

    if (!Number.isInteger(userId)) {
      return res.status(400).json({
        message: "Invalid user ID",
      });
    }

    // ==================================================
    // USER
    // ==================================================

    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
      include: {
        vendor: true,
        rider: true,
        staff: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // ==================================================
    // BASIC USER
    // ==================================================

    const baseUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    // ==================================================
    // RIDER
    // ==================================================

    if (user.role === "RIDER") {
      if (!user.rider) {
        return res.status(404).json({
          message: "Rider profile not found",
        });
      }

      const riderId = user.rider.id;

      const [
        totalDeliveries,
        delivered,
        assigned,
        outForDelivery,
        cancelled,
        returned,
        totalShipments,
        codStats,
        pickupCount,
        returnPickupCount,
        returnDeliveryCount,
      ] = await Promise.all([
        // Delivered shipments
        prisma.shipment.count({
          where: {
            riderId,
            status: "DELIVERED",
          },
        }),

        // Same as above, explicit
        prisma.shipment.count({
          where: {
            riderId,
            status: "DELIVERED",
          },
        }),

        // Assigned
        prisma.shipment.count({
          where: {
            riderId,
            status: "ASSIGNED_TO_RIDER",
          },
        }),

        // Out for delivery
        prisma.shipment.count({
          where: {
            riderId,
            status: "OUT_FOR_DELIVERY",
          },
        }),

        // Cancelled
        prisma.shipment.count({
          where: {
            riderId,
            status: "CANCELLED",
          },
        }),

        // Returned
        prisma.shipment.count({
          where: {
            riderId,
            status: {
              in: [
                "RETURN_REQUESTED",
                "RETURN_ASSIGNED_TO_RIDER",
                "RETURN_PICKED_UP_FROM_CUSTOMER",
                "RETURN_IN_WAREHOUSE",
                "OUT_FOR_RETURN",
                "RETURNED_TO_VENDOR",
              ],
            },
          },
        }),

        // All shipments assigned to rider
        prisma.shipment.count({
          where: {
            riderId,
          },
        }),

        // COD
        prisma.codCollection.aggregate({
          where: {
            riderId,
          },
          _sum: {
            amount: true,
          },
        }),

        // Pickups
        prisma.pickup.count({
          where: {
            riderId,
          },
        }),

        // Return pickup
        prisma.returnRequest.count({
          where: {
            riderId,
          },
        }),

        // Return delivery
        prisma.returnRequest.count({
          where: {
            returnDeliveryRiderId: riderId,
          },
        }),
      ]);

      const collectedCod = await prisma.codCollection.aggregate({
        where: {
          riderId,
          status: "COLLECTED",
        },
        _sum: {
          amount: true,
        },
      });

      const pendingCod = await prisma.codCollection.aggregate({
        where: {
          riderId,
          status: "PENDING",
        },
        _sum: {
          amount: true,
        },
      });

      return res.json({
        user: baseUser,

        type: "RIDER",

        rider: {
          id: riderId,
          phone: user.rider.phone,
          profilePicture: user.rider.profilePicture,

          vehicle: {
            type: user.rider.vehicleType,
            number: user.rider.vehicleNumber,
            brand: user.rider.vehicleBrand,
            model: user.rider.vehicleModel,
          },

          isAvailable: user.rider.isAvailable,

          location: {
            latitude: user.rider.latitude,
            longitude: user.rider.longitude,
          },

          statistics: {
            totalDeliveries,
            delivered,
            assigned,
            outForDelivery,
            cancelled,
            returned,
            totalShipments,

            totalCod: Number(codStats._sum.amount || 0),
            collectedCod: Number(
              collectedCod._sum.amount || 0
            ),
            pendingCod: Number(
              pendingCod._sum.amount || 0
            ),

            pickupCount,
            returnPickupCount,
            returnDeliveryCount,
          },
        },
      });
    }

    // ==================================================
    // VENDOR
    // ==================================================

    if (user.role === "VENDOR") {
      if (!user.vendor) {
        return res.status(404).json({
          message: "Vendor profile not found",
        });
      }

      const vendorId = user.vendor.id;

      // ==================================================
      // SHIPMENT STATISTICS
      // ==================================================

      const [
        totalOrders,
        deliveredOrders,
        pendingOrders,
        cancelledOrders,
        returnedOrders,
        totalCod,
        shippingCharges,
        returnCharges,
      ] = await Promise.all([
        prisma.shipment.count({
          where: {
            vendorId,
          },
        }),

        prisma.shipment.count({
          where: {
            vendorId,
            status: "DELIVERED",
          },
        }),

        prisma.shipment.count({
          where: {
            vendorId,
            status: {
              notIn: [
                "DELIVERED",
                "CANCELLED",
                "RETURNED_TO_VENDOR",
              ],
            },
          },
        }),

        prisma.shipment.count({
          where: {
            vendorId,
            status: "CANCELLED",
          },
        }),

        prisma.shipment.count({
          where: {
            vendorId,
            status: {
              in: [
                "RETURN_REQUESTED",
                "RETURN_ASSIGNED_TO_RIDER",
                "RETURN_PICKED_UP_FROM_CUSTOMER",
                "RETURN_IN_WAREHOUSE",
                "OUT_FOR_RETURN",
                "RETURNED_TO_VENDOR",
              ],
            },
          },
        }),

        prisma.shipment.aggregate({
          where: {
            vendorId,
            paymentType: "COD",
          },
          _sum: {
            codAmount: true,
          },
        }),

        prisma.shipment.aggregate({
          where: {
            vendorId,
          },
          _sum: {
            shippingCharge: true,
          },
        }),

        prisma.returnRequest.aggregate({
          where: {
            shipment: {
              vendorId,
            },
          },
          _sum: {
            returnCharge: true,
          },
        }),
      ]);

      // ==================================================
      // COD COLLECTION
      // ==================================================

      const collectedCod = await prisma.codCollection.aggregate({
        where: {
          shipment: {
            vendorId,
          },
          status: "COLLECTED",
        },
        _sum: {
          amount: true,
        },
      });

      const pendingCod = await prisma.codCollection.aggregate({
        where: {
          shipment: {
            vendorId,
          },
          status: "PENDING",
        },
        _sum: {
          amount: true,
        },
      });

      // ==================================================
      // ACCOUNTING
      // ==================================================

      const accountingEntries =
        await prisma.accountingEntry.findMany({
          where: {
            vendorId,
          },
          include: {
            settlementItems: true,
          },
        });

      let totalCredits = 0;
      let totalDebits = 0;

      let unsettledCredits = 0;
      let unsettledDebits = 0;

      for (const entry of accountingEntries) {
        const amount = Number(entry.amount || 0);

        const settledAmount =
          entry.settlementItems.reduce(
            (sum, item) =>
              sum + Number(item.amount || 0),
            0
          );

        const remaining = Math.max(
          0,
          amount - settledAmount
        );

        if (entry.direction === "CREDIT") {
          totalCredits += amount;
          unsettledCredits += remaining;
        } else {
          totalDebits += amount;
          unsettledDebits += remaining;
        }
      }

      // Positive = company needs to pay vendor
      // Negative = vendor owes company
      const toBePaid =
        unsettledCredits - unsettledDebits;

      // ==================================================
      // SETTLEMENTS
      // ==================================================

      const settlements =
        await prisma.vendorSettlement.findMany({
          where: {
            vendorId,
          },
          orderBy: {
            createdAt: "desc",
          },
        });

      const paidSettlements =
        settlements.filter(
          (settlement) =>
            settlement.status === "PAID"
        );

      const totalPaid = paidSettlements.reduce(
        (sum, settlement) =>
          sum + Number(settlement.netPayable || 0),
        0
      );

      const pendingSettlementAmount =
        settlements
          .filter(
            (settlement) =>
              settlement.status === "PENDING" ||
              settlement.status === "PROCESSING"
          )
          .reduce(
            (sum, settlement) =>
              sum +
              Number(settlement.netPayable || 0),
            0
          );

      return res.json({
        user: baseUser,

        type: "VENDOR",

        vendor: {
          id: vendorId,
          companyName: user.vendor.companyName,
          contactId: user.vendor.contactId,
          location: user.vendor.location,
          isRegistered: user.vendor.isRegistered,

          statistics: {
            totalOrders,
            deliveredOrders,
            pendingOrders,
            cancelledOrders,
            returnedOrders,

            totalCod: Number(
              totalCod._sum.codAmount || 0
            ),

            collectedCod: Number(
              collectedCod._sum.amount || 0
            ),

            pendingCod: Number(
              pendingCod._sum.amount || 0
            ),

            shippingCharges: Number(
              shippingCharges._sum.shippingCharge || 0
            ),

            returnCharges: Number(
              returnCharges._sum.returnCharge || 0
            ),

            totalCredits,
            totalDebits,

            toBePaid,

            totalPaid,
            pendingSettlementAmount,

            settlementCount: settlements.length,
            paidSettlementCount:
              paidSettlements.length,
          },
        },
      });
    }

    // ==================================================
    // STAFF
    // ==================================================

    if (user.role === "STAFF") {
      if (!user.staff) {
        return res.status(404).json({
          message: "Staff profile not found",
        });
      }

      const staffId = user.staff.id;

      const createdShipments =
        await prisma.shipment.count({
          where: {
            createdByStaffId: staffId,
          },
        });

      const deliveredShipments =
        await prisma.shipment.count({
          where: {
            createdByStaffId: staffId,
            status: "DELIVERED",
          },
        });

      const cancelledShipments =
        await prisma.shipment.count({
          where: {
            createdByStaffId: staffId,
            status: "CANCELLED",
          },
        });

      return res.json({
        user: baseUser,

        type: "STAFF",

        staff: {
          id: staffId,
          phone: user.staff.phone,
          profilePicture:
            user.staff.profilePicture,

          statistics: {
            createdShipments,
            deliveredShipments,
            cancelledShipments,
          },
        },
      });
    }

    // ==================================================
    // ADMIN / OTHER
    // ==================================================

    return res.json({
      user: baseUser,
      type: user.role,
    });
  } catch (error) {
    console.error(
      "GET USER DETAILS ERROR:",
      error
    );

    return res.status(500).json({
      message: "Failed to load user details",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : undefined,
    });
  }
};

module.exports = {
  getUserDetails,
};