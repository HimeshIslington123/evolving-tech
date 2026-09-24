import bcrypt from "bcrypt";
import prisma from "../config/prisma.js";
import jwt from "jsonwebtoken";
import { z } from "zod";

// ======================================================
// REGISTER
// ======================================================

export const register = async (req, res) => {
  try {
    const schema = z.object({
      name: z
        .string()
        .min(2, "Name must be at least 2 characters"),

      email: z
        .string()
        .email("Invalid email"),

      password: z
        .string()
        .min(8, "Password must be at least 8 characters")
        .regex(
          /[A-Z]/,
          "Password must contain an uppercase letter"
        )
        .regex(
          /[a-z]/,
          "Password must contain a lowercase letter"
        )
        .regex(
          /[0-9]/,
          "Password must contain a number"
        )
        .regex(
          /[^A-Za-z0-9]/,
          "Password must contain a special character"
        ),

      role: z.enum([
        "STAFF",
        "VENDOR",
        "RIDER",
      ]),

      companyName: z.string().optional(),
      contactId: z.string().optional(),
      location: z.string().optional(),

      phone: z.string().optional(),
      profilePicture: z.string().optional(),
    });

    const validation = schema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        message: "Validation failed",
        errors:
          validation.error.flatten().fieldErrors,
      });
    }

    const {
      name,
      email,
      password,
      role,
      companyName,
      contactId,
      location,
      phone,
      profilePicture,
    } = validation.data;

    const exists = await prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (exists) {
      return res.status(400).json({
        message: "Email already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(
      password,
      10
    );

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role,
      },
    });

    // ==================================================
    // VENDOR
    // ==================================================

    if (role === "VENDOR") {
      await prisma.vendor.create({
        data: {
          companyName,
          contactId,
          location,
          userId: user.id,
        },
      });
    }

    // ==================================================
    // RIDER
    // ==================================================

    if (role === "RIDER") {
      await prisma.rider.create({
        data: {
          phone,
          profilePicture,
          userId: user.id,
        },
      });
    }

    // ==================================================
    // STAFF
    // ==================================================

    if (role === "STAFF") {
      await prisma.staff.create({
        data: {
          phone,
          profilePicture,
          userId: user.id,
        },
      });
    }

    return res.status(201).json({
      message: "Registered Successfully",
    });

  } catch (err) {
    console.error(err);

    return res.status(500).json({
      message: "Server Error",
    });
  }
};

// ======================================================
// LOGIN
// ======================================================

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // ==================================================
    // CHECK FROZEN ACCOUNT
    // ==================================================

    if (!user.isActive) {
      return res.status(403).json({
        message: "Your account has been frozen",
      });
    }

    // ==================================================
    // CHECK PASSWORD
    // ==================================================

    const match = await bcrypt.compare(
      password,
      user.password
    );

    if (!match) {
      return res.status(400).json({
        message: "Invalid Password",
      });
    }

    // ==================================================
    // CREATE JWT
    // ==================================================

    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
      },
      "SECRET_KEY",
      {
        expiresIn: "7d",
      }
    );

    return res.json({
      token,
      role: user.role,
    });

  } catch (err) {
    console.error(err);

    return res.status(500).json({
      message: "Server Error",
    });
  }
};

// ======================================================
// GET USER DETAILS
// ======================================================

export const getUserDetails = async (req, res) => {
  try {
    // ==================================================
    // VALIDATE ID
    // ==================================================

    const idSchema = z.coerce.number().int().positive();

    const validation = idSchema.safeParse(
      req.params.id
    );

    if (!validation.success) {
      return res.status(400).json({
        message: "Invalid user ID",
      });
    }

    const userId = validation.data;

    // ==================================================
    // GET USER
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
    // BASE USER
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
          message:
            "Rider profile not found",
        });
      }

      const riderId = user.rider.id;

      // ----------------------------------------------
      // ALL SHIPMENTS
      // ----------------------------------------------

      const totalShipments =
        await prisma.shipment.count({
          where: {
            riderId,
          },
        });

      // ----------------------------------------------
      // DELIVERED
      // ----------------------------------------------

      const delivered =
        await prisma.shipment.count({
          where: {
            riderId,
            status: "DELIVERED",
          },
        });

      // ----------------------------------------------
      // ACTIVE / PENDING
      // ----------------------------------------------

      const pending =
        await prisma.shipment.count({
          where: {
            riderId,
            status: {
              notIn: [
                "DELIVERED",
                "CANCELLED",
              ],
            },
          },
        });

      // ----------------------------------------------
      // CANCELLED
      // ----------------------------------------------

      const cancelled =
        await prisma.shipment.count({
          where: {
            riderId,
            status: "CANCELLED",
          },
        });

      // ----------------------------------------------
      // COD TOTAL
      // ----------------------------------------------

      const codTotal =
        await prisma.codCollection.aggregate({
          where: {
            riderId,
          },
          _sum: {
            amount: true,
          },
        });

      // ----------------------------------------------
      // COD COLLECTED
      // ----------------------------------------------

      const codCollected =
        await prisma.codCollection.aggregate({
          where: {
            riderId,
            status: "COLLECTED",
          },
          _sum: {
            amount: true,
          },
        });

      // ----------------------------------------------
      // COD PENDING
      // ----------------------------------------------

      const codPending =
        await prisma.codCollection.aggregate({
          where: {
            riderId,
            status: "PENDING",
          },
          _sum: {
            amount: true,
          },
        });

      // ----------------------------------------------
      // PICKUPS
      // ----------------------------------------------

      const totalPickups =
        await prisma.pickup.count({
          where: {
            riderId,
          },
        });

      // ----------------------------------------------
      // RETURN PICKUPS
      // ----------------------------------------------

      const returnPickups =
        await prisma.returnRequest.count({
          where: {
            riderId,
          },
        });

      // ----------------------------------------------
      // RETURN DELIVERIES
      // ----------------------------------------------

      const returnDeliveries =
        await prisma.returnRequest.count({
          where: {
            returnDeliveryRiderId:
              riderId,
          },
        });

      return res.json({
        success: true,

        user: baseUser,

        rider: {
          id: user.rider.id,

          phone:
            user.rider.phone,

          profilePicture:
            user.rider.profilePicture,

          vehicleType:
            user.rider.vehicleType,

          vehicleNumber:
            user.rider.vehicleNumber,

          vehicleBrand:
            user.rider.vehicleBrand,

          vehicleModel:
            user.rider.vehicleModel,

          isAvailable:
            user.rider.isAvailable,

          latitude:
            user.rider.latitude,

          longitude:
            user.rider.longitude,
        },

        stats: {
          totalShipments,
          totalDeliveries: delivered,
          delivered,
          pending,
          cancelled,

          totalPickups,
          returnPickups,
          returnDeliveries,

          cod: {
            total:
              Number(
                codTotal._sum.amount || 0
              ),

            collected:
              Number(
                codCollected._sum.amount || 0
              ),

            pending:
              Number(
                codPending._sum.amount || 0
              ),
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
          message:
            "Vendor profile not found",
        });
      }

      const vendorId = user.vendor.id;

      // ----------------------------------------------
      // TOTAL ORDERS
      // ----------------------------------------------

      const totalOrders =
        await prisma.shipment.count({
          where: {
            vendorId,
          },
        });

      // ----------------------------------------------
      // DELIVERED
      // ----------------------------------------------

      const deliveredOrders =
        await prisma.shipment.count({
          where: {
            vendorId,
            status: "DELIVERED",
          },
        });

      // ----------------------------------------------
      // CANCELLED
      // ----------------------------------------------

      const cancelledOrders =
        await prisma.shipment.count({
          where: {
            vendorId,
            status: "CANCELLED",
          },
        });

      // ----------------------------------------------
      // RETURNED
      // ----------------------------------------------

      const returnedOrders =
        await prisma.shipment.count({
          where: {
            vendorId,
            status: "RETURNED_TO_VENDOR",
          },
        });

      // ----------------------------------------------
      // PENDING
      // ----------------------------------------------

      const pendingOrders =
        await prisma.shipment.count({
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
        });

      // ----------------------------------------------
      // COD
      // ----------------------------------------------

      const cod =
        await prisma.shipment.aggregate({
          where: {
            vendorId,
          },
          _sum: {
            codAmount: true,
          },
        });

      // ----------------------------------------------
      // SHIPPING CHARGES
      // ----------------------------------------------

      const shippingCharges =
        await prisma.shipment.aggregate({
          where: {
            vendorId,
          },
          _sum: {
            shippingCharge: true,
          },
        });

      // ----------------------------------------------
      // RETURN CHARGES
      // ----------------------------------------------

      const returnCharges =
        await prisma.returnRequest.aggregate({
          where: {
            shipment: {
              vendorId,
            },
          },
          _sum: {
            returnCharge: true,
          },
        });

      // ----------------------------------------------
      // ACCOUNTING CREDITS
      // ----------------------------------------------

      const credits =
        await prisma.accountingEntry.aggregate({
          where: {
            vendorId,
            direction: "CREDIT",
          },
          _sum: {
            amount: true,
          },
        });

      // ----------------------------------------------
      // ACCOUNTING DEBITS
      // ----------------------------------------------

      const debits =
        await prisma.accountingEntry.aggregate({
          where: {
            vendorId,
            direction: "DEBIT",
          },
          _sum: {
            amount: true,
          },
        });

      // ----------------------------------------------
      // SETTLEMENT ALLOCATIONS
      // ----------------------------------------------

      const settlementItems =
        await prisma.settlementItem.findMany({
          where: {
            accountingEntry: {
              vendorId,
            },
          },

          select: {
            accountingEntryId: true,
            amount: true,
          },
        });

      const settledByEntry =
        new Map();

      for (const item of settlementItems) {
        const current =
          settledByEntry.get(
            item.accountingEntryId
          ) || 0;

        settledByEntry.set(
          item.accountingEntryId,
          current + Number(item.amount)
        );
      }

      // ----------------------------------------------
      // UNSETTLED ACCOUNTING
      // ----------------------------------------------

      const accountingEntries =
        await prisma.accountingEntry.findMany({
          where: {
            vendorId,
          },

          select: {
            id: true,
            direction: true,
            amount: true,
          },
        });

      let unsettledCredits = 0;
      let unsettledDebits = 0;

      for (const entry of accountingEntries) {
        const amount =
          Number(entry.amount);

        const settled =
          settledByEntry.get(entry.id) || 0;

        const remaining = Math.max(
          0,
          amount - settled
        );

        if (
          entry.direction ===
          "CREDIT"
        ) {
          unsettledCredits += remaining;
        }

        if (
          entry.direction ===
          "DEBIT"
        ) {
          unsettledDebits += remaining;
        }
      }

      // ----------------------------------------------
      // ACTUAL TO BE PAID
      // ----------------------------------------------

      const toBePaid =
        unsettledCredits -
        unsettledDebits;

      // ----------------------------------------------
      // TOTAL SETTLEMENTS
      // ----------------------------------------------

      const settlementCount =
        await prisma.vendorSettlement.count({
          where: {
            vendorId,
          },
        });

      // ----------------------------------------------
      // PAID SETTLEMENTS
      // ----------------------------------------------

      const paidSettlementAggregate =
        await prisma.vendorSettlement.aggregate({
          where: {
            vendorId,
            status: "PAID",
          },
          _sum: {
            netPayable: true,
          },
        });

      // ----------------------------------------------
      // PENDING SETTLEMENTS
      // ----------------------------------------------

      const pendingSettlementAggregate =
        await prisma.vendorSettlement.aggregate({
          where: {
            vendorId,
            status: {
              in: [
                "PENDING",
                "PROCESSING",
              ],
            },
          },
          _sum: {
            netPayable: true,
          },
        });

      return res.json({
        success: true,

        user: baseUser,

        vendor: {
          id: user.vendor.id,

          companyName:
            user.vendor.companyName,

          contactId:
            user.vendor.contactId,

          location:
            user.vendor.location,

          isRegistered:
            user.vendor.isRegistered,
        },

        stats: {
          orders: {
            total: totalOrders,
            delivered:
              deliveredOrders,
            pending:
              pendingOrders,
            cancelled:
              cancelledOrders,
            returned:
              returnedOrders,
          },

          cod: {
            total:
              Number(
                cod._sum.codAmount || 0
              ),
          },

          charges: {
            shipping:
              Number(
                shippingCharges._sum
                  .shippingCharge || 0
              ),

            return:
              Number(
                returnCharges._sum
                  .returnCharge || 0
              ),
          },

          accounting: {
            totalCredits:
              Number(
                credits._sum.amount || 0
              ),

            totalDebits:
              Number(
                debits._sum.amount || 0
              ),

            unsettledCredits,

            unsettledDebits,

            toBePaid,

            amountToReceive:
              Math.max(0, toBePaid),

            amountVendorOwes:
              Math.max(0, -toBePaid),
          },

          settlements: {
            total:
              settlementCount,

            totalPaid:
              Number(
                paidSettlementAggregate
                  ._sum
                  .netPayable || 0
              ),

            pending:
              Number(
                pendingSettlementAggregate
                  ._sum
                  .netPayable || 0
              ),
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
          message:
            "Staff profile not found",
        });
      }

      const staffId = user.staff.id;

      // ----------------------------------------------
      // CREATED ORDERS
      // ----------------------------------------------

      const createdOrders =
        await prisma.shipment.count({
          where: {
            createdByStaffId:
              staffId,
          },
        });

      // ----------------------------------------------
      // DELIVERED ORDERS
      // ----------------------------------------------

      const deliveredOrders =
        await prisma.shipment.count({
          where: {
            createdByStaffId:
              staffId,

            status: "DELIVERED",
          },
        });

      // ----------------------------------------------
      // CANCELLED ORDERS
      // ----------------------------------------------

      const cancelledOrders =
        await prisma.shipment.count({
          where: {
            createdByStaffId:
              staffId,

            status: "CANCELLED",
          },
        });

      return res.json({
        success: true,

        user: baseUser,

        staff: {
          id: user.staff.id,

          phone:
            user.staff.phone,

          profilePicture:
            user.staff.profilePicture,
        },

        stats: {
          createdOrders,
          deliveredOrders,
          cancelledOrders,
        },
      });
    }

    // ==================================================
    // FALLBACK
    // ==================================================

    return res.json({
      success: true,
      user: baseUser,
      stats: {},
    });

  } catch (err) {
    console.error(
      "GET USER DETAILS ERROR:",
      err
    );

    return res.status(500).json({
      message: "Server Error",
    });
  }
};