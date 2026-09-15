import prisma from "../config/prisma.js";
import { z } from "zod";

// ======================================================
// HELPERS
// ======================================================

const toNumber = (value) => {
  if (value === null || value === undefined) {
    return 0;
  }

  return Number(value);
};

const money = (value) => {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
};

const allocatedOf = (entry) => {
  if (!entry.settlementItems) {
    return 0;
  }

  return entry.settlementItems.reduce(
    (sum, item) => sum + toNumber(item.amount),
    0
  );
};

const remainingOf = (entry) => {
  return money(toNumber(entry.amount) - allocatedOf(entry));
};

const getPagination = (query) => {
  const page = Math.max(1, Number(query.page) || 1);

  const limit = Math.min(
    100,
    Math.max(1, Number(query.limit) || 15)
  );

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
};

const buildPagination = (page, limit, total) => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit)),
});

// ======================================================
// VALIDATION
// ======================================================

const settlementItemSchema = z.object({
  accountingEntryId: z.string().min(1),

  amount: z.number().positive().finite(),
});

// items is OPTIONAL now.
// The admin UI creates a settlement with { vendorId, notes } only,
// in which case every unsettled entry of the vendor is used.
const createSettlementSchema = z.object({
  vendorId: z.number().int().positive(),

  items: z.array(settlementItemSchema).min(1).optional(),

  notes: z.string().nullish(),
});

const processSettlementSchema = z.object({
  notes: z.string().nullish(),
});

const paySettlementSchema = z.object({
  paymentReference: z.string().nullish(),

  notes: z.string().nullish(),
});

// ======================================================
// GET ACCOUNTING DASHBOARD
// GET /api/admin/accounting/dashboard
// ======================================================

export const getAccountingDashboard = async (req, res) => {
  try {
    const [
      credits,
      debits,
      pendingCod,
      collectedCod,
      pendingSettlements,
      processingSettlements,
      paidSettlements,
      totalVendors,
      vendorsWithOpenSettlement,
    ] = await Promise.all([
      prisma.accountingEntry.aggregate({
        where: { direction: "CREDIT" },
        _sum: { amount: true },
      }),

      prisma.accountingEntry.aggregate({
        where: { direction: "DEBIT" },
        _sum: { amount: true },
      }),

      prisma.codCollection.aggregate({
        where: { status: "PENDING" },
        _sum: { amount: true },
      }),

      prisma.codCollection.aggregate({
        where: { status: "COLLECTED" },
        _sum: { amount: true },
      }),

      prisma.vendorSettlement.aggregate({
        where: { status: "PENDING" },
        _sum: { netPayable: true },
      }),

      prisma.vendorSettlement.aggregate({
        where: { status: "PROCESSING" },
        _sum: { netPayable: true },
      }),

      prisma.vendorSettlement.aggregate({
        where: { status: "PAID" },
        _sum: { netPayable: true },
      }),

      prisma.vendor.count(),

      prisma.vendorSettlement.findMany({
        where: {
          status: { in: ["PENDING", "PROCESSING"] },
        },
        select: { vendorId: true },
        distinct: ["vendorId"],
      }),
    ]);

    const totalCredits = money(toNumber(credits._sum.amount));

    const totalDebits = money(toNumber(debits._sum.amount));

    const pending = money(
      toNumber(pendingSettlements._sum.netPayable)
    );

    const processing = money(
      toNumber(processingSettlements._sum.netPayable)
    );

    const paid = money(
      toNumber(paidSettlements._sum.netPayable)
    );

    res.json({
      success: true,

      data: {
        totalCredits,

        totalDebits,

        netBalance: money(totalCredits - totalDebits),

        cod: {
          pending: money(toNumber(pendingCod._sum.amount)),

          collected: money(
            toNumber(collectedCod._sum.amount)
          ),
        },

        settlements: {
          pending,

          processing,

          paid,

          totalOutstanding: money(pending + processing),
        },

        vendors: {
          total: totalVendors,

          pendingSettlement:
            vendorsWithOpenSettlement.length,
        },
      },
    });
  } catch (error) {
    console.error("getAccountingDashboard:", error);

    res.status(500).json({
      success: false,
      message: "Failed to load accounting dashboard",
    });
  }
};

// ======================================================
// GET ACCOUNTING ENTRIES
// GET /api/admin/accounting/entries
// ======================================================

export const getAccountingEntries = async (req, res) => {
  try {
    const {
      vendorId,
      shipmentId,
      returnRequestId,
      type,
      direction,
      search,
    } = req.query;

    const { page, limit, skip } = getPagination(req.query);

    const where = {};

    if (vendorId) {
      where.vendorId = Number(vendorId);
    }

    if (shipmentId) {
      where.shipmentId = shipmentId;
    }

    if (returnRequestId) {
      where.returnRequestId = returnRequestId;
    }

    if (type) {
      where.type = type;
    }

    if (direction) {
      where.direction = direction;
    }

    if (search) {
      where.OR = [
        {
          description: {
            contains: search,
            mode: "insensitive",
          },
        },

        {
          shipment: {
            trackingNumber: {
              contains: search,
              mode: "insensitive",
            },
          },
        },

        {
          shipment: {
            receiverName: {
              contains: search,
              mode: "insensitive",
            },
          },
        },

        {
          vendor: {
            companyName: {
              contains: search,
              mode: "insensitive",
            },
          },
        },
      ];
    }

    const [entries, total] = await Promise.all([
      prisma.accountingEntry.findMany({
        where,

        include: {
          vendor: {
            select: {
              id: true,
              companyName: true,
              contactId: true,
              location: true,
            },
          },

          shipment: {
            select: {
              id: true,
              trackingNumber: true,
              senderName: true,
              receiverName: true,
              paymentType: true,
              shippingCharge: true,
              codAmount: true,
              status: true,
            },
          },

          returnRequest: {
            select: {
              id: true,
              reason: true,
              status: true,
              returnCharge: true,
              returnChargeType: true,
              returnChargePayer: true,
            },
          },

          settlementItems: {
            select: {
              id: true,
              amount: true,
              settlementId: true,

              settlement: {
                select: {
                  id: true,
                  status: true,
                  direction: true,
                  netPayable: true,
                },
              },
            },
          },
        },

        orderBy: { createdAt: "desc" },

        skip,

        take: limit,
      }),

      prisma.accountingEntry.count({ where }),
    ]);

    const data = entries.map((entry) => {
      const allocated = allocatedOf(entry);

      return {
        id: entry.id,

        vendor: entry.vendor,

        shipment: entry.shipment
          ? {
              ...entry.shipment,

              shippingCharge: toNumber(
                entry.shipment.shippingCharge
              ),

              codAmount: toNumber(
                entry.shipment.codAmount
              ),
            }
          : null,

        returnRequest: entry.returnRequest
          ? {
              ...entry.returnRequest,

              returnCharge: toNumber(
                entry.returnRequest.returnCharge
              ),
            }
          : null,

        type: entry.type,

        direction: entry.direction,

        amount: toNumber(entry.amount),

        settlementAllocated: money(allocated),

        remainingAmount: money(
          toNumber(entry.amount) - allocated
        ),

        description: entry.description,

        createdAt: entry.createdAt,
      };
    });

    res.json({
      success: true,

      data,

      pagination: buildPagination(page, limit, total),
    });
  } catch (error) {
    console.error("getAccountingEntries:", error);

    res.status(500).json({
      success: false,
      message: "Failed to load accounting entries",
    });
  }
};

// ======================================================
// GET SINGLE ACCOUNTING ENTRY
// GET /api/admin/accounting/entries/:id
// ======================================================

export const getAccountingEntryById = async (req, res) => {
  try {
    const entry = await prisma.accountingEntry.findUnique({
      where: { id: req.params.id },

      include: {
        vendor: true,

        shipment: true,

        returnRequest: true,

        settlementItems: {
          include: { settlement: true },
        },
      },
    });

    if (!entry) {
      return res.status(404).json({
        success: false,
        message: "Accounting entry not found",
      });
    }

    const allocated = allocatedOf(entry);

    res.json({
      success: true,

      data: {
        ...entry,

        amount: toNumber(entry.amount),

        allocatedAmount: money(allocated),

        remainingAmount: money(
          toNumber(entry.amount) - allocated
        ),

        settlementItems: entry.settlementItems.map(
          (item) => ({
            ...item,

            amount: toNumber(item.amount),

            settlement: item.settlement
              ? {
                  ...item.settlement,

                  netPayable: toNumber(
                    item.settlement.netPayable
                  ),

                  netAmount: toNumber(
                    item.settlement.netPayable
                  ),
                }
              : null,
          })
        ),
      },
    });
  } catch (error) {
    console.error("getAccountingEntryById:", error);

    res.status(500).json({
      success: false,
      message: "Failed to load accounting entry",
    });
  }
};

// ======================================================
// GET VENDORS ACCOUNTING SUMMARY
// GET /api/admin/accounting/vendors
// ======================================================

export const getAccountingVendors = async (req, res) => {
  try {
    const vendors = await prisma.vendor.findMany({
      include: {
        _count: {
          select: {
            shipments: true,
            accountingEntries: true,
            settlements: true,
          },
        },

        accountingEntries: {
          select: {
            amount: true,
            direction: true,

            settlementItems: {
              select: { amount: true },
            },
          },
        },

        settlements: {
          where: {
            status: { in: ["PENDING", "PROCESSING"] },
          },

          select: { netPayable: true },
        },
      },

      orderBy: { companyName: "asc" },
    });

    const data = vendors.map((vendor) => {
      let totalCredits = 0;
      let totalDebits = 0;

      let availableCredits = 0;
      let availableDebits = 0;

      for (const entry of vendor.accountingEntries) {
        const amount = toNumber(entry.amount);

        const remaining = remainingOf(entry);

        if (entry.direction === "CREDIT") {
          totalCredits += amount;
          availableCredits += remaining;
        } else {
          totalDebits += amount;
          availableDebits += remaining;
        }
      }

      const balance = money(
        availableCredits - availableDebits
      );

      const outstandingSettlement = vendor.settlements.reduce(
        (sum, settlement) =>
          sum + toNumber(settlement.netPayable),
        0
      );

      return {
        id: vendor.id,

        companyName: vendor.companyName,

        contactId: vendor.contactId,

        location: vendor.location,

        _count: vendor._count,

        totalCredits: money(totalCredits),

        totalDebits: money(totalDebits),

        availableCredits: money(availableCredits),

        availableDebits: money(availableDebits),

        balance,

        direction:
          balance > 0
            ? "PAY_VENDOR"
            : balance < 0
              ? "COLLECT_FROM_VENDOR"
              : null,

        settlementAmount: Math.abs(balance),

        outstandingSettlement: money(
          outstandingSettlement
        ),

        pendingSettlementCount:
          vendor.settlements.length,
      };
    });

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("getAccountingVendors:", error);

    res.status(500).json({
      success: false,
      message: "Failed to load vendor accounting",
    });
  }
};

// ======================================================
// GET VENDOR UNSETTLED ENTRIES
// GET /api/admin/accounting/vendors/:vendorId/unsettled
// ======================================================

export const getUnsettledVendorEntries = async (
  req,
  res
) => {
  try {
    const vendorId = Number(req.params.vendorId);

    if (!vendorId || Number.isNaN(vendorId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid vendor ID",
      });
    }

    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },

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
        message: "Vendor not found",
      });
    }

    const entries = await prisma.accountingEntry.findMany({
      where: { vendorId },

      include: {
        shipment: {
          select: {
            id: true,
            trackingNumber: true,
            receiverName: true,
            shippingCharge: true,
            codAmount: true,
          },
        },

        returnRequest: {
          select: {
            id: true,
            reason: true,
            returnCharge: true,
          },
        },

        settlementItems: {
          select: { amount: true },
        },
      },

      orderBy: { createdAt: "asc" },
    });

    const formatted = entries
      .map((entry) => ({
        id: entry.id,

        type: entry.type,

        direction: entry.direction,

        amount: toNumber(entry.amount),

        allocatedAmount: money(allocatedOf(entry)),

        remainingAmount: remainingOf(entry),

        description: entry.description,

        shipment: entry.shipment,

        returnRequest: entry.returnRequest,

        createdAt: entry.createdAt,
      }))
      .filter((entry) => entry.remainingAmount > 0);

    let totalCredits = 0;
    let totalDebits = 0;

    const credits = [];
    const debits = [];

    for (const entry of formatted) {
      if (entry.direction === "CREDIT") {
        totalCredits += entry.remainingAmount;
        credits.push(entry);
      } else {
        totalDebits += entry.remainingAmount;
        debits.push(entry);
      }
    }

    const netAmount = money(totalCredits - totalDebits);

    res.json({
      success: true,

      data: {
        vendor,

        credits,

        debits,

        summary: {
          totalCredits: money(totalCredits),

          totalDebits: money(totalDebits),

          netAmount,

          direction:
            netAmount > 0
              ? "PAY_VENDOR"
              : netAmount < 0
                ? "COLLECT_FROM_VENDOR"
                : null,

          settlementAmount: Math.abs(netAmount),
        },
      },
    });
  } catch (error) {
    console.error("getUnsettledVendorEntries:", error);

    res.status(500).json({
      success: false,
      message: "Failed to load vendor unsettled entries",
    });
  }
};

// ======================================================
// GET VENDOR ACCOUNTING
// GET /api/admin/accounting/vendors/:vendorId
// ======================================================

export const getVendorAccounting = async (req, res) => {
  try {
    const vendorId = Number(req.params.vendorId);

    if (!vendorId || Number.isNaN(vendorId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid vendor ID",
      });
    }

    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },

      include: {
        _count: {
          select: {
            shipments: true,
            accountingEntries: true,
            settlements: true,
          },
        },

        settlements: {
          orderBy: { createdAt: "desc" },

          include: {
            items: {
              include: { accountingEntry: true },
            },
          },
        },
      },
    });

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found",
      });
    }

    const entries = await prisma.accountingEntry.findMany({
      where: { vendorId },

      include: {
        shipment: {
          select: {
            id: true,
            trackingNumber: true,
            receiverName: true,
            paymentType: true,
            codAmount: true,
            shippingCharge: true,
          },
        },

        returnRequest: {
          select: {
            id: true,
            reason: true,
            status: true,
            returnCharge: true,
          },
        },

        settlementItems: {
          select: { amount: true },
        },
      },

      orderBy: { createdAt: "desc" },
    });

    let totalCredits = 0;
    let totalDebits = 0;

    let availableCredits = 0;
    let availableDebits = 0;

    for (const entry of entries) {
      const amount = toNumber(entry.amount);

      const remaining = remainingOf(entry);

      if (entry.direction === "CREDIT") {
        totalCredits += amount;
        availableCredits += remaining;
      } else {
        totalDebits += amount;
        availableDebits += remaining;
      }
    }

    const balance = money(
      availableCredits - availableDebits
    );

    const remainingByTypes = (types) =>
      money(
        entries
          .filter((entry) => types.includes(entry.type))
          .reduce(
            (sum, entry) => sum + remainingOf(entry),
            0
          )
      );

    const outstandingSettlement = vendor.settlements
      .filter(
        (settlement) =>
          settlement.status === "PENDING" ||
          settlement.status === "PROCESSING"
      )
      .reduce(
        (sum, settlement) =>
          sum + toNumber(settlement.netPayable),
        0
      );

    res.json({
      success: true,

      data: {
        vendor: {
          id: vendor.id,

          companyName: vendor.companyName,

          contactId: vendor.contactId,

          location: vendor.location,

          _count: vendor._count,
        },

        summary: {
          totalCredits: money(totalCredits),

          totalDebits: money(totalDebits),

          availableCredits: money(availableCredits),

          availableDebits: money(availableDebits),

          balance,

          direction:
            balance > 0
              ? "PAY_VENDOR"
              : balance < 0
                ? "COLLECT_FROM_VENDOR"
                : null,

          settlementAmount: Math.abs(balance),

          outstandingSettlement: money(
            outstandingSettlement
          ),

          codAmount: remainingByTypes([
            "COD_COLLECTION",
          ]),

          shippingCharge: remainingByTypes([
            "SHIPPING_CHARGE",
          ]),

          returnCharge: remainingByTypes([
            "RETURN_CHARGE",
          ]),

          otherCharges: remainingByTypes([
            "PICKUP_CHARGE",
            "STORAGE_CHARGE",
            "OTHER_CHARGE",
          ]),
        },

        entries: entries.map((entry) => ({
          ...entry,

          amount: toNumber(entry.amount),

          allocatedAmount: money(allocatedOf(entry)),

          remainingAmount: remainingOf(entry),
        })),

        settlements: vendor.settlements.map(
          (settlement) => ({
            ...settlement,

            totalCodAmount: toNumber(
              settlement.totalCodAmount
            ),

            totalShippingCharge: toNumber(
              settlement.totalShippingCharge
            ),

            totalReturnCharge: toNumber(
              settlement.totalReturnCharge
            ),

            totalOtherCharges: toNumber(
              settlement.totalOtherCharges
            ),

            totalCredits: toNumber(
              settlement.totalCredits
            ),

            totalDebits: toNumber(
              settlement.totalDebits
            ),

            netPayable: toNumber(
              settlement.netPayable
            ),

            netAmount: toNumber(settlement.netPayable),
          })
        ),
      },
    });
  } catch (error) {
    console.error("getVendorAccounting:", error);

    res.status(500).json({
      success: false,
      message: "Failed to load vendor accounting",
    });
  }
};

// ======================================================
// GET COD COLLECTIONS
// GET /api/admin/accounting/cod
// ======================================================

export const getCodCollections = async (req, res) => {
  try {
    const { status, vendorId, riderId, search } =
      req.query;

    const { page, limit, skip } = getPagination(req.query);

    const where = {};

    if (status) {
      where.status = status;
    }

    if (riderId) {
      where.riderId = Number(riderId);
    }

    if (vendorId) {
      where.shipment = {
        ...(where.shipment || {}),
        vendorId: Number(vendorId),
      };
    }

    if (search) {
      where.shipment = {
        ...(where.shipment || {}),

        OR: [
          {
            trackingNumber: {
              contains: search,
              mode: "insensitive",
            },
          },

          {
            receiverName: {
              contains: search,
              mode: "insensitive",
            },
          },
        ],
      };
    }

    const [collections, total] = await Promise.all([
      prisma.codCollection.findMany({
        where,

        include: {
          shipment: {
            select: {
              id: true,
              trackingNumber: true,
              receiverName: true,
              receiverPhone: true,
              codAmount: true,

              vendor: {
                select: {
                  id: true,
                  companyName: true,
                },
              },
            },
          },

          rider: {
            select: {
              id: true,
              phone: true,

              user: {
                select: { name: true },
              },
            },
          },
        },

        orderBy: { createdAt: "desc" },

        skip,

        take: limit,
      }),

      prisma.codCollection.count({ where }),
    ]);

    const data = collections.map((collection) => ({
      id: collection.id,

      shipment: collection.shipment
        ? {
            ...collection.shipment,

            codAmount: toNumber(
              collection.shipment.codAmount
            ),
          }
        : null,

      rider: collection.rider,

      amount: toNumber(collection.amount),

      status: collection.status,

      collectedAt: collection.collectedAt,

      notes: collection.notes,

      createdAt: collection.createdAt,
    }));

    res.json({
      success: true,

      data,

      pagination: buildPagination(page, limit, total),
    });
  } catch (error) {
    console.error("getCodCollections:", error);

    res.status(500).json({
      success: false,
      message: "Failed to load COD collections",
    });
  }
};

// ======================================================
// CREATE SETTLEMENT
// POST /api/admin/accounting/settlements
// ======================================================

export const createSettlement = async (req, res) => {
  try {
    const parsed = createSettlementSchema.safeParse({
      ...req.body,

      vendorId: Number(req.body?.vendorId),
    });

    if (!parsed.success) {
      return res.status(400).json({
        success: false,

        message: "Invalid settlement data",

        errors: parsed.error.flatten(),
      });
    }

    const { vendorId, notes } = parsed.data;

    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
    });

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found",
      });
    }

    const activeSettlement =
      await prisma.vendorSettlement.findFirst({
        where: {
          vendorId,

          status: { in: ["PENDING", "PROCESSING"] },
        },
      });

    if (activeSettlement) {
      return res.status(400).json({
        success: false,

        message:
          "Vendor already has a pending or processing settlement",
      });
    }

    // ==================================================
    // RESOLVE ITEMS
    // ==================================================

    let items = parsed.data.items;

    const vendorEntries =
      await prisma.accountingEntry.findMany({
        where: { vendorId },

        include: {
          settlementItems: {
            select: { amount: true },
          },
        },

        orderBy: { createdAt: "asc" },
      });

    const entryMap = new Map(
      vendorEntries.map((entry) => [entry.id, entry])
    );

    if (!items || items.length === 0) {
      // Auto mode: settle every entry that still has a balance.
      items = vendorEntries
        .map((entry) => ({
          accountingEntryId: entry.id,
          amount: remainingOf(entry),
        }))
        .filter((item) => item.amount > 0);

      if (items.length === 0) {
        return res.status(400).json({
          success: false,

          message:
            "This vendor has no unsettled accounting entries",
        });
      }
    } else {
      const uniqueIds = new Set(
        items.map((item) => item.accountingEntryId)
      );

      if (uniqueIds.size !== items.length) {
        return res.status(400).json({
          success: false,

          message: "Duplicate accounting entries selected",
        });
      }

      for (const item of items) {
        if (!entryMap.has(item.accountingEntryId)) {
          return res.status(400).json({
            success: false,

            message:
              "One or more accounting entries do not belong to this vendor",
          });
        }
      }
    }

    // ==================================================
    // TOTALS
    // ==================================================

    let totalCredits = 0;
    let totalDebits = 0;

    let totalCodAmount = 0;
    let totalShippingCharge = 0;
    let totalReturnCharge = 0;
    let totalOtherCharges = 0;

    const settlementItems = [];

    for (const item of items) {
      const entry = entryMap.get(item.accountingEntryId);

      if (!entry) {
        return res.status(400).json({
          success: false,

          message: `Accounting entry ${item.accountingEntryId} not found`,
        });
      }

      const remaining = remainingOf(entry);

      if (item.amount > remaining) {
        return res.status(400).json({
          success: false,

          message: `Entry ${entry.id} only has Rs. ${remaining.toFixed(
            2
          )} available`,
        });
      }

      if (entry.direction === "CREDIT") {
        totalCredits += item.amount;
      } else {
        totalDebits += item.amount;
      }

      if (entry.type === "COD_COLLECTION") {
        totalCodAmount += item.amount;
      } else if (entry.type === "SHIPPING_CHARGE") {
        totalShippingCharge += item.amount;
      } else if (entry.type === "RETURN_CHARGE") {
        totalReturnCharge += item.amount;
      } else {
        totalOtherCharges += item.amount;
      }

      settlementItems.push({
        accountingEntryId: entry.id,

        amount: item.amount,
      });
    }

    totalCredits = money(totalCredits);
    totalDebits = money(totalDebits);

    const netAmount = money(totalCredits - totalDebits);

    if (netAmount === 0) {
      return res.status(400).json({
        success: false,

        message: "Selected entries result in zero balance",
      });
    }

    const direction =
      netAmount > 0 ? "PAY_VENDOR" : "COLLECT_FROM_VENDOR";

    const settlement =
      await prisma.vendorSettlement.create({
        data: {
          vendorId,

          direction,

          totalCodAmount: money(totalCodAmount),

          totalShippingCharge: money(
            totalShippingCharge
          ),

          totalReturnCharge: money(totalReturnCharge),

          totalOtherCharges: money(totalOtherCharges),

          totalCredits,

          totalDebits,

          // Prisma field is netPayable.
          // Stored as the absolute amount to move,
          // the direction says which way it moves.
          netPayable: Math.abs(netAmount),

          status: "PENDING",

          notes: notes || null,

          items: { create: settlementItems },
        },

        include: {
          vendor: {
            select: {
              id: true,
              companyName: true,
              contactId: true,
            },
          },

          items: {
            include: { accountingEntry: true },
          },
        },
      });

    res.status(201).json({
      success: true,

      message:
        direction === "PAY_VENDOR"
          ? "Vendor payment settlement created"
          : "Vendor collection settlement created",

      data: {
        ...settlement,

        totalCodAmount: toNumber(
          settlement.totalCodAmount
        ),

        totalShippingCharge: toNumber(
          settlement.totalShippingCharge
        ),

        totalReturnCharge: toNumber(
          settlement.totalReturnCharge
        ),

        totalOtherCharges: toNumber(
          settlement.totalOtherCharges
        ),

        totalCredits: toNumber(settlement.totalCredits),

        totalDebits: toNumber(settlement.totalDebits),

        netPayable: toNumber(settlement.netPayable),

        netAmount: toNumber(settlement.netPayable),
      },
    });
  } catch (error) {
    console.error("createSettlement:", error);

    res.status(500).json({
      success: false,
      message: "Failed to create settlement",
    });
  }
};

// ======================================================
// GET SETTLEMENTS
// GET /api/admin/accounting/settlements
// ======================================================

export const getSettlements = async (req, res) => {
  try {
    const { vendorId, status, direction } = req.query;

    const { page, limit, skip } = getPagination(req.query);

    const where = {};

    if (vendorId) {
      where.vendorId = Number(vendorId);
    }

    if (status) {
      where.status = status;
    }

    if (direction) {
      where.direction = direction;
    }

    const [settlements, total] = await Promise.all([
      prisma.vendorSettlement.findMany({
        where,

        include: {
          vendor: {
            select: {
              id: true,
              companyName: true,
              contactId: true,
              location: true,
            },
          },

          items: {
            include: {
              accountingEntry: {
                select: {
                  id: true,
                  type: true,
                  direction: true,
                  amount: true,
                  description: true,

                  shipment: {
                    select: {
                      trackingNumber: true,
                    },
                  },
                },
              },
            },
          },
        },

        orderBy: { createdAt: "desc" },

        skip,

        take: limit,
      }),

      prisma.vendorSettlement.count({ where }),
    ]);

    const data = settlements.map((settlement) => ({
      ...settlement,

      totalCodAmount: toNumber(
        settlement.totalCodAmount
      ),

      totalShippingCharge: toNumber(
        settlement.totalShippingCharge
      ),

      totalReturnCharge: toNumber(
        settlement.totalReturnCharge
      ),

      totalOtherCharges: toNumber(
        settlement.totalOtherCharges
      ),

      totalCredits: toNumber(settlement.totalCredits),

      totalDebits: toNumber(settlement.totalDebits),

      netPayable: toNumber(settlement.netPayable),

      netAmount: toNumber(settlement.netPayable),

      items: settlement.items.map((item) => ({
        ...item,

        amount: toNumber(item.amount),

        accountingEntry: item.accountingEntry
          ? {
              ...item.accountingEntry,

              amount: toNumber(
                item.accountingEntry.amount
              ),
            }
          : null,
      })),
    }));

    res.json({
      success: true,

      data,

      pagination: buildPagination(page, limit, total),
    });
  } catch (error) {
    console.error("getSettlements:", error);

    res.status(500).json({
      success: false,
      message: "Failed to load settlements",
    });
  }
};

// ======================================================
// GET SINGLE SETTLEMENT
// GET /api/admin/accounting/settlements/:id
// ======================================================

export const getSettlementById = async (req, res) => {
  try {
    const settlement =
      await prisma.vendorSettlement.findUnique({
        where: { id: req.params.id },

        include: {
          vendor: true,

          items: {
            include: {
              accountingEntry: {
                include: {
                  shipment: true,
                  returnRequest: true,
                },
              },
            },
          },
        },
      });

    if (!settlement) {
      return res.status(404).json({
        success: false,
        message: "Settlement not found",
      });
    }

    res.json({
      success: true,

      data: {
        ...settlement,

        totalCodAmount: toNumber(
          settlement.totalCodAmount
        ),

        totalShippingCharge: toNumber(
          settlement.totalShippingCharge
        ),

        totalReturnCharge: toNumber(
          settlement.totalReturnCharge
        ),

        totalOtherCharges: toNumber(
          settlement.totalOtherCharges
        ),

        totalCredits: toNumber(settlement.totalCredits),

        totalDebits: toNumber(settlement.totalDebits),

        netPayable: toNumber(settlement.netPayable),

        netAmount: toNumber(settlement.netPayable),

        items: settlement.items.map((item) => ({
          ...item,

          amount: toNumber(item.amount),
        })),
      },
    });
  } catch (error) {
    console.error("getSettlementById:", error);

    res.status(500).json({
      success: false,
      message: "Failed to load settlement",
    });
  }
};

// ======================================================
// PROCESS SETTLEMENT
// PATCH /api/admin/accounting/settlements/:id/process
// ======================================================

export const processSettlement = async (req, res) => {
  try {
    const parsed = processSettlementSchema.safeParse(
      req.body || {}
    );

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid data",
      });
    }

    const settlement =
      await prisma.vendorSettlement.findUnique({
        where: { id: req.params.id },
      });

    if (!settlement) {
      return res.status(404).json({
        success: false,
        message: "Settlement not found",
      });
    }

    if (settlement.status !== "PENDING") {
      return res.status(400).json({
        success: false,

        message:
          "Only pending settlements can be processed",
      });
    }

    const updated = await prisma.vendorSettlement.update({
      where: { id: settlement.id },

      data: {
        status: "PROCESSING",

        notes: parsed.data.notes || settlement.notes,
      },
    });

    res.json({
      success: true,

      message: "Settlement is now processing",

      data: {
        ...updated,

        netPayable: toNumber(updated.netPayable),

        netAmount: toNumber(updated.netPayable),
      },
    });
  } catch (error) {
    console.error("processSettlement:", error);

    res.status(500).json({
      success: false,

      message: "Failed to process settlement",
    });
  }
};

// ======================================================
// PAY / COLLECT SETTLEMENT
// PATCH /api/admin/accounting/settlements/:id/pay
// ======================================================

export const completeSettlement = async (req, res) => {
  try {
    const parsed = paySettlementSchema.safeParse(
      req.body || {}
    );

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment data",
      });
    }

    const settlement =
      await prisma.vendorSettlement.findUnique({
        where: { id: req.params.id },

        include: {
          vendor: true,
          items: true,
        },
      });

    if (!settlement) {
      return res.status(404).json({
        success: false,
        message: "Settlement not found",
      });
    }

    if (
      settlement.status !== "PROCESSING" &&
      settlement.status !== "PENDING"
    ) {
      return res.status(400).json({
        success: false,

        message:
          "Only pending or processing settlements can be completed",
      });
    }

    const amount = Math.abs(
      toNumber(settlement.netPayable)
    );

    if (amount <= 0) {
      return res.status(400).json({
        success: false,

        message:
          "Settlement amount must be greater than zero",
      });
    }

    const description =
      settlement.direction === "PAY_VENDOR"
        ? `Paid vendor settlement ${settlement.id}`
        : `Collected vendor settlement ${settlement.id}`;

    const result = await prisma.$transaction(
      async (tx) => {
        // ============================================
        // VERIFY SETTLEMENT ITEMS
        // ============================================

        for (const item of settlement.items) {
          const entry =
            await tx.accountingEntry.findUnique({
              where: { id: item.accountingEntryId },

              include: {
                settlementItems: {
                  select: {
                    amount: true,
                    settlementId: true,
                  },
                },
              },
            });

          if (!entry) {
            throw new Error(
              `Accounting entry ${item.accountingEntryId} not found`
            );
          }

          const otherAllocated = entry.settlementItems
            .filter(
              (x) => x.settlementId !== settlement.id
            )
            .reduce(
              (sum, x) => sum + toNumber(x.amount),
              0
            );

          const available = money(
            toNumber(entry.amount) -
              otherAllocated -
              toNumber(item.amount)
          );

          if (available < 0) {
            throw new Error(
              `Accounting entry ${entry.id} has insufficient remaining balance`
            );
          }
        }

        // ============================================
        // CREATE SETTLEMENT ACCOUNTING ENTRY
        // ============================================

        await tx.accountingEntry.create({
          data: {
            vendorId: settlement.vendorId,

            type: "VENDOR_SETTLEMENT",

            direction:
              settlement.direction === "PAY_VENDOR"
                ? "DEBIT"
                : "CREDIT",

            amount,

            description,
          },
        });

        // ============================================
        // MARK SETTLEMENT PAID
        // ============================================

        return tx.vendorSettlement.update({
          where: { id: settlement.id },

          data: {
            status: "PAID",

            paidAt: new Date(),

            paymentReference:
              parsed.data.paymentReference || null,

            notes:
              parsed.data.notes || settlement.notes,
          },

          include: {
            vendor: true,

            items: {
              include: { accountingEntry: true },
            },
          },
        });
      }
    );

    res.json({
      success: true,

      message:
        settlement.direction === "PAY_VENDOR"
          ? `Rs. ${amount.toFixed(2)} paid to vendor`
          : `Rs. ${amount.toFixed(
              2
            )} collected from vendor`,

      data: {
        ...result,

        netPayable: toNumber(result.netPayable),

        netAmount: toNumber(result.netPayable),
      },
    });
  } catch (error) {
    console.error("completeSettlement:", error);

    res.status(500).json({
      success: false,

      message:
        error.message || "Failed to complete settlement",
    });
  }
};

// ======================================================
// CANCEL SETTLEMENT
// PATCH /api/admin/accounting/settlements/:id/cancel
// ======================================================

export const cancelSettlement = async (req, res) => {
  try {
    const settlement =
      await prisma.vendorSettlement.findUnique({
        where: { id: req.params.id },
      });

    if (!settlement) {
      return res.status(404).json({
        success: false,
        message: "Settlement not found",
      });
    }

    if (settlement.status === "PAID") {
      return res.status(400).json({
        success: false,

        message: "Paid settlement cannot be cancelled",
      });
    }

    if (settlement.status === "CANCELLED") {
      return res.status(400).json({
        success: false,

        message: "Settlement is already cancelled",
      });
    }

    const updated = await prisma.vendorSettlement.update({
      where: { id: settlement.id },

      data: { status: "CANCELLED" },
    });

    res.json({
      success: true,

      message: "Settlement cancelled",

      data: {
        ...updated,

        netPayable: toNumber(updated.netPayable),

        netAmount: toNumber(updated.netPayable),
      },
    });
  } catch (error) {
    console.error("cancelSettlement:", error);

    res.status(500).json({
      success: false,
      message: "Failed to cancel settlement",
    });
  }
};

// ======================================================
// BACKWARD-COMPATIBLE ALIASES
// (old import names still work)
// ======================================================

export const getVendorUnsettledEntries =
  getUnsettledVendorEntries;