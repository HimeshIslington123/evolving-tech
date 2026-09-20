import prisma from "../config/prisma.js";
import { z } from "zod";

// ======================================================
// HELPERS
// ======================================================

const toNumber = (value) => {
  if (value === null || value === undefined) {
    return 0;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : 0;
};

const money = (value) => {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 0;
  }

  return Math.round((number + Number.EPSILON) * 100) / 100;
};

/**
 * Only allocations from ACTIVE settlements count.
 *
 * PAID       -> allocation remains consumed
 * PROCESSING -> allocation remains consumed
 * PENDING    -> allocation remains consumed
 * CANCELLED  -> allocation is released
 */
const allocatedOf = (entry) => {
  if (!entry?.settlementItems?.length) {
    return 0;
  }

  return money(
    entry.settlementItems.reduce((sum, item) => {
      const status = item.settlement?.status;

      if (status === "CANCELLED") {
        return sum;
      }

      return sum + toNumber(item.amount);
    }, 0)
  );
};

const remainingOf = (entry) => {
  return money(
    Math.max(
      0,
      toNumber(entry.amount) - allocatedOf(entry)
    )
  );
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

/**
 * Settlement audit entries are NOT operational vendor
 * credits/debits.
 *
 * They are kept only for historical compatibility.
 */
const operationalEntryWhere = {
  type: {
    not: "VENDOR_SETTLEMENT",
  },
};

// ======================================================
// VALIDATION
// ======================================================

const settlementItemSchema = z.object({
  accountingEntryId: z.string().min(1),

  amount: z
    .number()
    .positive()
    .finite(),
});

const createSettlementSchema = z.object({
  vendorId: z
    .number()
    .int()
    .positive(),

  items: z
    .array(settlementItemSchema)
    .min(1)
    .optional(),

  notes: z
    .string()
    .nullish(),
});

const processSettlementSchema = z.object({
  notes: z
    .string()
    .nullish(),
});

const paySettlementSchema = z.object({
  paymentReference: z
    .string()
    .nullish(),

  notes: z
    .string()
    .nullish(),
});

// ======================================================
// ACCOUNTING ENTRY INCLUDE
// ======================================================

const settlementAllocationInclude = {
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
};

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
      operationalEntries,
    ] = await Promise.all([
      // ================================================
      // TOTAL CREDITS
      // EXCLUDE VENDOR_SETTLEMENT
      // ================================================

      prisma.accountingEntry.aggregate({
        where: {
          direction: "CREDIT",

          type: {
            not: "VENDOR_SETTLEMENT",
          },
        },

        _sum: {
          amount: true,
        },
      }),

      // ================================================
      // TOTAL CHARGES
      // EXCLUDE VENDOR_SETTLEMENT
      // ================================================

      prisma.accountingEntry.aggregate({
        where: {
          direction: "DEBIT",

          type: {
            not: "VENDOR_SETTLEMENT",
          },
        },

        _sum: {
          amount: true,
        },
      }),

      // ================================================
      // PENDING COD
      // ================================================

      prisma.codCollection.aggregate({
        where: {
          status: "PENDING",
        },

        _sum: {
          amount: true,
        },
      }),

      // ================================================
      // COLLECTED COD
      // ================================================

      prisma.codCollection.aggregate({
        where: {
          status: "COLLECTED",
        },

        _sum: {
          amount: true,
        },
      }),

      // ================================================
      // PENDING SETTLEMENTS
      // ================================================

      prisma.vendorSettlement.aggregate({
        where: {
          status: "PENDING",
        },

        _sum: {
          netPayable: true,
        },
      }),

      // ================================================
      // PROCESSING SETTLEMENTS
      // ================================================

      prisma.vendorSettlement.aggregate({
        where: {
          status: "PROCESSING",
        },

        _sum: {
          netPayable: true,
        },
      }),

      // ================================================
      // PAID SETTLEMENTS
      // ================================================

      prisma.vendorSettlement.aggregate({
        where: {
          status: "PAID",
        },

        _sum: {
          netPayable: true,
        },
      }),

      // ================================================
      // TOTAL VENDORS
      // ================================================

      prisma.vendor.count(),

      // ================================================
      // VENDORS WITH OPEN SETTLEMENT
      // ================================================

      prisma.vendorSettlement.findMany({
        where: {
          status: {
            in: [
              "PENDING",
              "PROCESSING",
            ],
          },
        },

        select: {
          vendorId: true,
        },

        distinct: ["vendorId"],
      }),

      // ================================================
      // OPERATIONAL ENTRIES
      //
      // Used for actual company earnings.
      // ================================================

      prisma.accountingEntry.findMany({
        where: {
          type: {
            in: [
              "SHIPPING_CHARGE",
              "RETURN_CHARGE",
              "PICKUP_CHARGE",
              "STORAGE_CHARGE",
              "OTHER_CHARGE",
              "REFUND",
            ],
          },
        },

        select: {
          type: true,
          direction: true,
          amount: true,
        },
      }),
    ]);

    // ==================================================
    // TOTALS
    // ==================================================

    const totalCredits = money(
      toNumber(credits._sum.amount)
    );

    const totalDebits = money(
      toNumber(debits._sum.amount)
    );

    // ==================================================
    // COMPANY EARNINGS
    //
    // Charges are revenue.
    // Refunds represented as CREDIT reduce revenue.
    // ==================================================

    let companyEarnings = 0;

    for (const entry of operationalEntries) {
      const amount = toNumber(entry.amount);

      if (
        entry.type === "REFUND" &&
        entry.direction === "CREDIT"
      ) {
        companyEarnings -= amount;
        continue;
      }

      if (entry.direction === "DEBIT") {
        companyEarnings += amount;
      }
    }

    companyEarnings = money(companyEarnings);

    // ==================================================
    // SETTLEMENT TOTALS
    // ==================================================

    const pending = money(
      toNumber(
        pendingSettlements._sum.netPayable
      )
    );

    const processing = money(
      toNumber(
        processingSettlements._sum.netPayable
      )
    );

    const paid = money(
      toNumber(
        paidSettlements._sum.netPayable
      )
    );

    // ==================================================
    // CURRENT OUTSTANDING
    //
    // IMPORTANT:
    // Raw historical credit/debit totals are NOT the
    // same as current vendor payable.
    //
    // Calculate outstanding from unallocated entries.
    // ==================================================

    const vendorEntries =
      await prisma.accountingEntry.findMany({
        where: operationalEntryWhere,

        select: {
          amount: true,
          direction: true,

          settlementItems: {
            select: {
              amount: true,

              settlement: {
                select: {
                  status: true,
                },
              },
            },
          },
        },
      });

    let outstandingCredits = 0;
    let outstandingDebits = 0;

    for (const entry of vendorEntries) {
      const allocated =
        entry.settlementItems.reduce(
          (sum, item) => {
            if (
              item.settlement?.status ===
              "CANCELLED"
            ) {
              return sum;
            }

            return (
              sum +
              toNumber(item.amount)
            );
          },
          0
        );

      const remaining = money(
        Math.max(
          0,
          toNumber(entry.amount) -
            allocated
        )
      );

      if (entry.direction === "CREDIT") {
        outstandingCredits += remaining;
      } else {
        outstandingDebits += remaining;
      }
    }

    outstandingCredits = money(
      outstandingCredits
    );

    outstandingDebits = money(
      outstandingDebits
    );

    const outstandingVendorBalance = money(
      outstandingCredits -
        outstandingDebits
    );

    // ==================================================
    // RESPONSE
    // ==================================================

    return res.json({
      success: true,

      data: {
        // Historical operational ledger totals
        totalCredits,

        totalDebits,

        // Current unsettled vendor amount
        netBalance:
          outstandingVendorBalance,

        outstandingVendorBalance,

        companyEarnings,

        cod: {
          pending: money(
            toNumber(
              pendingCod._sum.amount
            )
          ),

          collected: money(
            toNumber(
              collectedCod._sum.amount
            )
          ),
        },

        settlements: {
          pending,

          processing,

          paid,

          totalOutstanding: money(
            pending + processing
          ),
        },

        vendors: {
          total: totalVendors,

          pendingSettlement:
            vendorsWithOpenSettlement.length,
        },
      },
    });
  } catch (error) {
    console.error(
      "getAccountingDashboard:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to load accounting dashboard",
    });
  }
};

// ======================================================
// GET ACCOUNTING ENTRIES
// GET /api/admin/accounting/entries
// ======================================================

export const getAccountingEntries = async (
  req,
  res
) => {
  try {
    const {
      vendorId,
      shipmentId,
      returnRequestId,
      type,
      direction,
      search,
    } = req.query;

    const {
      page,
      limit,
      skip,
    } = getPagination(req.query);

    const where = {};

    if (vendorId) {
      const id = Number(vendorId);

      if (!Number.isNaN(id)) {
        where.vendorId = id;
      }
    }

    if (shipmentId) {
      where.shipmentId = shipmentId;
    }

    if (returnRequestId) {
      where.returnRequestId =
        returnRequestId;
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

    const [
      entries,
      total,
    ] = await Promise.all([
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

          ...settlementAllocationInclude,
        },

        orderBy: {
          createdAt: "desc",
        },

        skip,

        take: limit,
      }),

      prisma.accountingEntry.count({
        where,
      }),
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

        returnRequest:
          entry.returnRequest
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

        settlementAllocated:
          money(allocated),

        remainingAmount: money(
          Math.max(
            0,
            toNumber(entry.amount) -
              allocated
          )
        ),

        description:
          entry.description,

        createdAt:
          entry.createdAt,
      };
    });

    return res.json({
      success: true,

      data,

      pagination: buildPagination(
        page,
        limit,
        total
      ),
    });
  } catch (error) {
    console.error(
      "getAccountingEntries:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to load accounting entries",
    });
  }
};

// ======================================================
// GET SINGLE ACCOUNTING ENTRY
// GET /api/admin/accounting/entries/:id
// ======================================================

export const getAccountingEntryById =
  async (req, res) => {
    try {
      const entry =
        await prisma.accountingEntry.findUnique({
          where: {
            id: req.params.id,
          },

          include: {
            vendor: true,

            shipment: true,

            returnRequest: true,

            ...settlementAllocationInclude,
          },
        });

      if (!entry) {
        return res.status(404).json({
          success: false,
          message:
            "Accounting entry not found",
        });
      }

      const allocated =
        allocatedOf(entry);

      return res.json({
        success: true,

        data: {
          ...entry,

          amount:
            toNumber(entry.amount),

          allocatedAmount:
            money(allocated),

          remainingAmount:
            money(
              Math.max(
                0,
                toNumber(entry.amount) -
                  allocated
              )
            ),

          settlementItems:
            entry.settlementItems.map(
              (item) => ({
                ...item,

                amount:
                  toNumber(item.amount),

                settlement:
                  item.settlement
                    ? {
                        ...item.settlement,

                        netPayable:
                          toNumber(
                            item.settlement
                              .netPayable
                          ),

                        netAmount:
                          toNumber(
                            item.settlement
                              .netPayable
                          ),
                      }
                    : null,
              })
            ),
        },
      });
    } catch (error) {
      console.error(
        "getAccountingEntryById:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to load accounting entry",
      });
    }
  };

// ======================================================
// GET VENDORS ACCOUNTING SUMMARY
// GET /api/admin/accounting/vendors
// ======================================================

export const getAccountingVendors =
  async (req, res) => {
    try {
      const vendors =
        await prisma.vendor.findMany({
          include: {
            _count: {
              select: {
                shipments: true,
                accountingEntries: true,
                settlements: true,
              },
            },

            accountingEntries: {
              where: {
                type: {
                  not: "VENDOR_SETTLEMENT",
                },
              },

              select: {
                amount: true,
                direction: true,
                type: true,

                settlementItems: {
                  select: {
                    amount: true,

                    settlement: {
                      select: {
                        status: true,
                      },
                    },
                  },
                },
              },
            },

            settlements: {
              where: {
                status: {
                  in: [
                    "PENDING",
                    "PROCESSING",
                  ],
                },
              },

              select: {
                netPayable: true,
              },
            },
          },

          orderBy: {
            companyName: "asc",
          },
        });

      const data =
        vendors.map((vendor) => {
          let totalCredits = 0;
          let totalDebits = 0;

          let availableCredits = 0;
          let availableDebits = 0;

          for (
            const entry of
            vendor.accountingEntries
          ) {
            const amount =
              toNumber(entry.amount);

            const allocated =
              entry.settlementItems.reduce(
                (sum, item) => {
                  if (
                    item.settlement?.status ===
                    "CANCELLED"
                  ) {
                    return sum;
                  }

                  return (
                    sum +
                    toNumber(item.amount)
                  );
                },
                0
              );

            const remaining =
              money(
                Math.max(
                  0,
                  amount - allocated
                )
              );

            if (
              entry.direction ===
              "CREDIT"
            ) {
              totalCredits += amount;
              availableCredits += remaining;
            } else {
              totalDebits += amount;
              availableDebits += remaining;
            }
          }

          totalCredits =
            money(totalCredits);

          totalDebits =
            money(totalDebits);

          availableCredits =
            money(availableCredits);

          availableDebits =
            money(availableDebits);

          const balance =
            money(
              availableCredits -
                availableDebits
            );

          const outstandingSettlement =
            vendor.settlements.reduce(
              (sum, settlement) =>
                sum +
                toNumber(
                  settlement.netPayable
                ),
              0
            );

          return {
            id: vendor.id,

            companyName:
              vendor.companyName,

            contactId:
              vendor.contactId,

            location:
              vendor.location,

            _count:
              vendor._count,

            totalCredits,

            totalDebits,

            availableCredits,

            availableDebits,

            balance,

            direction:
              balance > 0
                ? "PAY_VENDOR"
                : balance < 0
                  ? "COLLECT_FROM_VENDOR"
                  : null,

            settlementAmount:
              money(
                Math.abs(balance)
              ),

            outstandingSettlement:
              money(
                outstandingSettlement
              ),

            pendingSettlementCount:
              vendor.settlements.length,
          };
        });

      return res.json({
        success: true,
        data,
      });
    } catch (error) {
      console.error(
        "getAccountingVendors:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to load vendor accounting",
      });
    }
  };

// ======================================================
// GET VENDOR UNSETTLED ENTRIES
// GET /api/admin/accounting/vendors/:vendorId/unsettled
// ======================================================

export const getUnsettledVendorEntries =
  async (req, res) => {
    try {
      const vendorId =
        Number(req.params.vendorId);

      if (
        !vendorId ||
        Number.isNaN(vendorId)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid vendor ID",
        });
      }

      const vendor =
        await prisma.vendor.findUnique({
          where: {
            id: vendorId,
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
          message:
            "Vendor not found",
        });
      }

      const entries =
        await prisma.accountingEntry.findMany({
          where: {
            vendorId,

            type: {
              not: "VENDOR_SETTLEMENT",
            },
          },

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

            ...settlementAllocationInclude,
          },

          orderBy: {
            createdAt: "asc",
          },
        });

      const formatted =
        entries
          .map((entry) => ({
            id: entry.id,

            type: entry.type,

            direction:
              entry.direction,

            amount:
              toNumber(entry.amount),

            allocatedAmount:
              money(
                allocatedOf(entry)
              ),

            remainingAmount:
              remainingOf(entry),

            description:
              entry.description,

            shipment:
              entry.shipment
                ? {
                    ...entry.shipment,

                    shippingCharge:
                      toNumber(
                        entry.shipment
                          .shippingCharge
                      ),

                    codAmount:
                      toNumber(
                        entry.shipment
                          .codAmount
                      ),
                  }
                : null,

            returnRequest:
              entry.returnRequest
                ? {
                    ...entry.returnRequest,

                    returnCharge:
                      toNumber(
                        entry.returnRequest
                          .returnCharge
                      ),
                  }
                : null,

            createdAt:
              entry.createdAt,
          }))
          .filter(
            (entry) =>
              entry.remainingAmount > 0
          );

      let totalCredits = 0;
      let totalDebits = 0;

      const credits = [];
      const debits = [];

      for (
        const entry of formatted
      ) {
        if (
          entry.direction ===
          "CREDIT"
        ) {
          totalCredits +=
            entry.remainingAmount;

          credits.push(entry);
        } else {
          totalDebits +=
            entry.remainingAmount;

          debits.push(entry);
        }
      }

      totalCredits =
        money(totalCredits);

      totalDebits =
        money(totalDebits);

      const netAmount =
        money(
          totalCredits -
            totalDebits
        );

      return res.json({
        success: true,

        data: {
          vendor,

          credits,

          debits,

          summary: {
            totalCredits,

            totalDebits,

            netAmount,

            direction:
              netAmount > 0
                ? "PAY_VENDOR"
                : netAmount < 0
                  ? "COLLECT_FROM_VENDOR"
                  : null,

            settlementAmount:
              money(
                Math.abs(netAmount)
              ),
          },
        },
      });
    } catch (error) {
      console.error(
        "getUnsettledVendorEntries:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to load vendor unsettled entries",
      });
    }
  };

// ======================================================
// GET VENDOR ACCOUNTING
// GET /api/admin/accounting/vendors/:vendorId
// ======================================================

export const getVendorAccounting =
  async (req, res) => {
    try {
      const vendorId =
        Number(req.params.vendorId);

      if (
        !vendorId ||
        Number.isNaN(vendorId)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid vendor ID",
        });
      }

      const vendor =
        await prisma.vendor.findUnique({
          where: {
            id: vendorId,
          },

          include: {
            _count: {
              select: {
                shipments: true,
                accountingEntries: true,
                settlements: true,
              },
            },

            settlements: {
              orderBy: {
                createdAt: "desc",
              },

              include: {
                items: {
                  include: {
                    accountingEntry: true,
                  },
                },
              },
            },
          },
        });

      if (!vendor) {
        return res.status(404).json({
          success: false,
          message:
            "Vendor not found",
        });
      }

      const entries =
        await prisma.accountingEntry.findMany({
          where: {
            vendorId,

            type: {
              not: "VENDOR_SETTLEMENT",
            },
          },

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

            ...settlementAllocationInclude,
          },

          orderBy: {
            createdAt: "desc",
          },
        });

      let totalCredits = 0;
      let totalDebits = 0;

      let availableCredits = 0;
      let availableDebits = 0;

      for (
        const entry of entries
      ) {
        const amount =
          toNumber(entry.amount);

        const remaining =
          remainingOf(entry);

        if (
          entry.direction ===
          "CREDIT"
        ) {
          totalCredits += amount;
          availableCredits += remaining;
        } else {
          totalDebits += amount;
          availableDebits += remaining;
        }
      }

      totalCredits =
        money(totalCredits);

      totalDebits =
        money(totalDebits);

      availableCredits =
        money(availableCredits);

      availableDebits =
        money(availableDebits);

      const balance =
        money(
          availableCredits -
            availableDebits
        );

      const remainingByTypes =
        (types) =>
          money(
            entries
              .filter((entry) =>
                types.includes(
                  entry.type
                )
              )
              .reduce(
                (sum, entry) =>
                  sum +
                  remainingOf(entry),
                0
              )
          );

      const outstandingSettlement =
        vendor.settlements
          .filter(
            (settlement) =>
              settlement.status ===
                "PENDING" ||
              settlement.status ===
                "PROCESSING"
          )
          .reduce(
            (sum, settlement) =>
              sum +
              toNumber(
                settlement.netPayable
              ),
            0
          );

      return res.json({
        success: true,

        data: {
          vendor: {
            id: vendor.id,

            companyName:
              vendor.companyName,

            contactId:
              vendor.contactId,

            location:
              vendor.location,

            _count:
              vendor._count,
          },

          summary: {
            totalCredits,

            totalDebits,

            availableCredits,

            availableDebits,

            balance,

            direction:
              balance > 0
                ? "PAY_VENDOR"
                : balance < 0
                  ? "COLLECT_FROM_VENDOR"
                  : null,

            settlementAmount:
              money(
                Math.abs(balance)
              ),

            outstandingSettlement:
              money(
                outstandingSettlement
              ),

            codAmount:
              remainingByTypes([
                "COD_COLLECTION",
              ]),

            shippingCharge:
              remainingByTypes([
                "SHIPPING_CHARGE",
              ]),

            returnCharge:
              remainingByTypes([
                "RETURN_CHARGE",
              ]),

            otherCharges:
              remainingByTypes([
                "PICKUP_CHARGE",
                "STORAGE_CHARGE",
                "OTHER_CHARGE",
              ]),
          },

          entries:
            entries.map((entry) => ({
              ...entry,

              amount:
                toNumber(
                  entry.amount
                ),

              allocatedAmount:
                money(
                  allocatedOf(entry)
                ),

              remainingAmount:
                remainingOf(entry),
            })),

          settlements:
            vendor.settlements.map(
              (settlement) => ({
                ...settlement,

                totalCodAmount:
                  toNumber(
                    settlement
                      .totalCodAmount
                  ),

                totalShippingCharge:
                  toNumber(
                    settlement
                      .totalShippingCharge
                  ),

                totalReturnCharge:
                  toNumber(
                    settlement
                      .totalReturnCharge
                  ),

                totalOtherCharges:
                  toNumber(
                    settlement
                      .totalOtherCharges
                  ),

                totalCredits:
                  toNumber(
                    settlement
                      .totalCredits
                  ),

                totalDebits:
                  toNumber(
                    settlement
                      .totalDebits
                  ),

                netPayable:
                  toNumber(
                    settlement
                      .netPayable
                  ),

                netAmount:
                  toNumber(
                    settlement
                      .netPayable
                  ),

                items:
                  settlement.items.map(
                    (item) => ({
                      ...item,

                      amount:
                        toNumber(
                          item.amount
                        ),

                      accountingEntry:
                        item.accountingEntry
                          ? {
                              ...item.accountingEntry,

                              amount:
                                toNumber(
                                  item
                                    .accountingEntry
                                    .amount
                                ),
                            }
                          : null,
                    })
                  ),
              })
            ),
        },
      });
    } catch (error) {
      console.error(
        "getVendorAccounting:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to load vendor accounting",
      });
    }
  };

// ======================================================
// GET COD COLLECTIONS
// GET /api/admin/accounting/cod
// ======================================================

export const getCodCollections =
  async (req, res) => {
    try {
      const {
        status,
        vendorId,
        riderId,
        search,
      } = req.query;

      const {
        page,
        limit,
        skip,
      } = getPagination(req.query);

      const where = {};

      if (status) {
        where.status = status;
      }

      if (riderId) {
        const id = Number(riderId);

        if (!Number.isNaN(id)) {
          where.riderId = id;
        }
      }

      if (vendorId) {
        const id = Number(vendorId);

        if (!Number.isNaN(id)) {
          where.shipment = {
            ...(where.shipment || {}),
            vendorId: id,
          };
        }
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

      const [
        collections,
        total,
      ] = await Promise.all([
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
                  select: {
                    name: true,
                  },
                },
              },
            },
          },

          orderBy: {
            createdAt: "desc",
          },

          skip,

          take: limit,
        }),

        prisma.codCollection.count({
          where,
        }),
      ]);

      const data =
        collections.map(
          (collection) => ({
            id: collection.id,

            shipment:
              collection.shipment
                ? {
                    ...collection.shipment,

                    codAmount:
                      toNumber(
                        collection
                          .shipment
                          .codAmount
                      ),
                  }
                : null,

            rider:
              collection.rider,

            amount:
              toNumber(
                collection.amount
              ),

            status:
              collection.status,

            collectedAt:
              collection.collectedAt,

            notes:
              collection.notes,

            createdAt:
              collection.createdAt,
          })
        );

      return res.json({
        success: true,

        data,

        pagination:
          buildPagination(
            page,
            limit,
            total
          ),
      });
    } catch (error) {
      console.error(
        "getCodCollections:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to load COD collections",
      });
    }
  };

// ======================================================
// CREATE SETTLEMENT
// POST /api/admin/accounting/settlements
// ======================================================

export const createSettlement =
  async (req, res) => {
    try {
      const parsed =
        createSettlementSchema.safeParse({
          ...req.body,

          vendorId:
            Number(
              req.body?.vendorId
            ),
        });

      if (!parsed.success) {
        return res.status(400).json({
          success: false,

          message:
            "Invalid settlement data",

          errors:
            parsed.error.flatten(),
        });
      }

      const {
        vendorId,
        notes,
      } = parsed.data;

      const settlement =
        await prisma.$transaction(
          async (tx) => {
            // ==========================================
            // VENDOR
            // ==========================================

            const vendor =
              await tx.vendor.findUnique({
                where: {
                  id: vendorId,
                },

                select: {
                  id: true,
                  companyName: true,
                  contactId: true,
                  location: true,
                },
              });

            if (!vendor) {
              throw new Error(
                "VENDOR_NOT_FOUND"
              );
            }

            // ==========================================
            // ACTIVE SETTLEMENT CHECK
            // ==========================================

            const activeSettlement =
              await tx.vendorSettlement.findFirst({
                where: {
                  vendorId,

                  status: {
                    in: [
                      "PENDING",
                      "PROCESSING",
                    ],
                  },
                },

                select: {
                  id: true,
                },
              });

            if (activeSettlement) {
              throw new Error(
                "ACTIVE_SETTLEMENT_EXISTS"
              );
            }

            // ==========================================
            // LOAD OPERATIONAL SOURCE ENTRIES
            // ==========================================

            const vendorEntries =
              await tx.accountingEntry.findMany({
                where: {
                  vendorId,

                  type: {
                    not:
                      "VENDOR_SETTLEMENT",
                  },
                },

                include:
                  settlementAllocationInclude,

                orderBy: {
                  createdAt: "asc",
                },
              });

            const entryMap =
              new Map(
                vendorEntries.map(
                  (entry) => [
                    entry.id,
                    entry,
                  ]
                )
              );

            // ==========================================
            // RESOLVE ITEMS
            // ==========================================

            let items =
              parsed.data.items;

            if (
              !items ||
              items.length === 0
            ) {
              items =
                vendorEntries
                  .map(
                    (entry) => ({
                      accountingEntryId:
                        entry.id,

                      amount:
                        remainingOf(
                          entry
                        ),
                    })
                  )
                  .filter(
                    (item) =>
                      item.amount > 0
                  );
            } else {
              // ========================================
              // DUPLICATES
              // ========================================

              const uniqueIds =
                new Set(
                  items.map(
                    (item) =>
                      item.accountingEntryId
                  )
                );

              if (
                uniqueIds.size !==
                items.length
              ) {
                throw new Error(
                  "DUPLICATE_ENTRIES"
                );
              }

              // ========================================
              // VERIFY ENTRIES
              // ========================================

              for (
                const item of items
              ) {
                const entry =
                  entryMap.get(
                    item.accountingEntryId
                  );

                if (!entry) {
                  throw new Error(
                    "INVALID_VENDOR_ENTRY"
                  );
                }
              }
            }

            // ==========================================
            // NO ITEMS
            // ==========================================

            if (
              !items.length
            ) {
              throw new Error(
                "NO_UNSETTLED_ENTRIES"
              );
            }

            // ==========================================
            // TOTALS
            // ==========================================

            let totalCredits = 0;
            let totalDebits = 0;

            let totalCodAmount = 0;
            let totalShippingCharge = 0;
            let totalReturnCharge = 0;
            let totalOtherCharges = 0;

            const settlementItems = [];

            for (
              const item of items
            ) {
              const entry =
                entryMap.get(
                  item.accountingEntryId
                );

              if (!entry) {
                throw new Error(
                  `ENTRY_NOT_FOUND:${item.accountingEntryId}`
                );
              }

              const remaining =
                remainingOf(entry);

              const requested =
                money(item.amount);

              // ========================================
              // VALIDATE AMOUNT
              // ========================================

              if (
                requested <= 0
              ) {
                throw new Error(
                  `INVALID_AMOUNT:${entry.id}`
                );
              }

              if (
                requested >
                remaining
              ) {
                throw new Error(
                  `INSUFFICIENT_BALANCE:${entry.id}:${remaining.toFixed(
                    2
                  )}`
                );
              }

              // ========================================
              // CREDIT / DEBIT
              // ========================================

              if (
                entry.direction ===
                "CREDIT"
              ) {
                totalCredits +=
                  requested;
              } else {
                totalDebits +=
                  requested;
              }

              // ========================================
              // BREAKDOWN
              // ========================================

              switch (
                entry.type
              ) {
                case "COD_COLLECTION":
                  totalCodAmount +=
                    requested;
                  break;

                case "SHIPPING_CHARGE":
                  totalShippingCharge +=
                    requested;
                  break;

                case "RETURN_CHARGE":
                  totalReturnCharge +=
                    requested;
                  break;

                default:
                  totalOtherCharges +=
                    requested;
                  break;
              }

              settlementItems.push({
                accountingEntryId:
                  entry.id,

                amount:
                  requested,
              });
            }

            totalCredits =
              money(totalCredits);

            totalDebits =
              money(totalDebits);

            totalCodAmount =
              money(totalCodAmount);

            totalShippingCharge =
              money(totalShippingCharge);

            totalReturnCharge =
              money(totalReturnCharge);

            totalOtherCharges =
              money(totalOtherCharges);

            // ==========================================
            // NET
            // ==========================================

            const netAmount =
              money(
                totalCredits -
                  totalDebits
              );

            if (
              netAmount === 0
            ) {
              throw new Error(
                "ZERO_BALANCE"
              );
            }

            const direction =
              netAmount > 0
                ? "PAY_VENDOR"
                : "COLLECT_FROM_VENDOR";

            const netPayable =
              money(
                Math.abs(netAmount)
              );

            // ==========================================
            // CREATE SETTLEMENT
            // ==========================================

            return tx.vendorSettlement.create({
              data: {
                vendorId,

                direction,

                totalCodAmount,

                totalShippingCharge,

                totalReturnCharge,

                totalOtherCharges,

                totalCredits,

                totalDebits,

                netPayable,

                status:
                  "PENDING",

                notes:
                  notes || null,

                items: {
                  create:
                    settlementItems,
                },
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

                items: {
                  include: {
                    accountingEntry: true,
                  },
                },
              },
            });
          },
          {
            maxWait: 10000,
            timeout: 15000,
          }
        );

      return res.status(201).json({
        success: true,

        message:
          settlement.direction ===
          "PAY_VENDOR"
            ? "Vendor payment settlement created"
            : "Vendor collection settlement created",

        data: {
          ...settlement,

          totalCodAmount:
            toNumber(
              settlement.totalCodAmount
            ),

          totalShippingCharge:
            toNumber(
              settlement.totalShippingCharge
            ),

          totalReturnCharge:
            toNumber(
              settlement.totalReturnCharge
            ),

          totalOtherCharges:
            toNumber(
              settlement.totalOtherCharges
            ),

          totalCredits:
            toNumber(
              settlement.totalCredits
            ),

          totalDebits:
            toNumber(
              settlement.totalDebits
            ),

          netPayable:
            toNumber(
              settlement.netPayable
            ),

          netAmount:
            toNumber(
              settlement.netPayable
            ),
        },
      });
    } catch (error) {
      console.error(
        "createSettlement:",
        error
      );

      switch (
        error.message
      ) {
        case "VENDOR_NOT_FOUND":
          return res.status(404).json({
            success: false,
            message:
              "Vendor not found",
          });

        case "ACTIVE_SETTLEMENT_EXISTS":
          return res.status(400).json({
            success: false,
            message:
              "Vendor already has a pending or processing settlement",
          });

        case "DUPLICATE_ENTRIES":
          return res.status(400).json({
            success: false,
            message:
              "Duplicate accounting entries selected",
          });

        case "INVALID_VENDOR_ENTRY":
          return res.status(400).json({
            success: false,
            message:
              "One or more accounting entries do not belong to this vendor",
          });

        case "NO_UNSETTLED_ENTRIES":
          return res.status(400).json({
            success: false,
            message:
              "This vendor has no unsettled accounting entries",
          });

        case "ZERO_BALANCE":
          return res.status(400).json({
            success: false,
            message:
              "Selected entries result in zero balance",
          });

        default:
          if (
            error.message?.startsWith(
              "INSUFFICIENT_BALANCE:"
            )
          ) {
            const parts =
              error.message.split(":");

            return res.status(400).json({
              success: false,

              message:
                `Accounting entry ${parts[1]} only has Rs. ${parts[2]} available`,
            });
          }

          if (
            error.message?.startsWith(
              "INVALID_AMOUNT:"
            )
          ) {
            return res.status(400).json({
              success: false,

              message:
                "Settlement amount must be greater than zero",
            });
          }

          return res.status(500).json({
            success: false,

            message:
              "Failed to create settlement",
          });
      }
    }
  };

// ======================================================
// GET SETTLEMENTS
// GET /api/admin/accounting/settlements
// ======================================================

export const getSettlements =
  async (req, res) => {
    try {
      const {
        vendorId,
        status,
        direction,
      } = req.query;

      const {
        page,
        limit,
        skip,
      } = getPagination(req.query);

      const where = {};

      if (vendorId) {
        const id =
          Number(vendorId);

        if (!Number.isNaN(id)) {
          where.vendorId = id;
        }
      }

      if (status) {
        where.status = status;
      }

      if (direction) {
        where.direction =
          direction;
      }

      const [
        settlements,
        total,
      ] = await Promise.all([
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

          orderBy: {
            createdAt: "desc",
          },

          skip,

          take: limit,
        }),

        prisma.vendorSettlement.count({
          where,
        }),
      ]);

      const data =
        settlements.map(
          (settlement) => ({
            ...settlement,

            totalCodAmount:
              toNumber(
                settlement.totalCodAmount
              ),

            totalShippingCharge:
              toNumber(
                settlement
                  .totalShippingCharge
              ),

            totalReturnCharge:
              toNumber(
                settlement
                  .totalReturnCharge
              ),

            totalOtherCharges:
              toNumber(
                settlement
                  .totalOtherCharges
              ),

            totalCredits:
              toNumber(
                settlement.totalCredits
              ),

            totalDebits:
              toNumber(
                settlement.totalDebits
              ),

            netPayable:
              toNumber(
                settlement.netPayable
              ),

            netAmount:
              toNumber(
                settlement.netPayable
              ),

            items:
              settlement.items.map(
                (item) => ({
                  ...item,

                  amount:
                    toNumber(
                      item.amount
                    ),

                  accountingEntry:
                    item.accountingEntry
                      ? {
                          ...item.accountingEntry,

                          amount:
                            toNumber(
                              item
                                .accountingEntry
                                .amount
                            ),
                        }
                      : null,
                })
              ),
          })
        );

      return res.json({
        success: true,

        data,

        pagination:
          buildPagination(
            page,
            limit,
            total
          ),
      });
    } catch (error) {
      console.error(
        "getSettlements:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to load settlements",
      });
    }
  };

// ======================================================
// GET SINGLE SETTLEMENT
// GET /api/admin/accounting/settlements/:id
// ======================================================

export const getSettlementById =
  async (req, res) => {
    try {
      const settlement =
        await prisma.vendorSettlement.findUnique({
          where: {
            id: req.params.id,
          },

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
          message:
            "Settlement not found",
        });
      }

      return res.json({
        success: true,

        data: {
          ...settlement,

          totalCodAmount:
            toNumber(
              settlement.totalCodAmount
            ),

          totalShippingCharge:
            toNumber(
              settlement
                .totalShippingCharge
            ),

          totalReturnCharge:
            toNumber(
              settlement
                .totalReturnCharge
            ),

          totalOtherCharges:
            toNumber(
              settlement
                .totalOtherCharges
            ),

          totalCredits:
            toNumber(
              settlement.totalCredits
            ),

          totalDebits:
            toNumber(
              settlement.totalDebits
            ),

          netPayable:
            toNumber(
              settlement.netPayable
            ),

          netAmount:
            toNumber(
              settlement.netPayable
            ),

          items:
            settlement.items.map(
              (item) => ({
                ...item,

                amount:
                  toNumber(
                    item.amount
                  ),

                accountingEntry:
                  item.accountingEntry
                    ? {
                        ...item.accountingEntry,

                        amount:
                          toNumber(
                            item
                              .accountingEntry
                              .amount
                          ),
                      }
                    : null,
              })
            ),
        },
      });
    } catch (error) {
      console.error(
        "getSettlementById:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to load settlement",
      });
    }
  };

// ======================================================
// PROCESS SETTLEMENT
// PATCH /api/admin/accounting/settlements/:id/process
// ======================================================

export const processSettlement =
  async (req, res) => {
    try {
      const parsed =
        processSettlementSchema.safeParse(
          req.body || {}
        );

      if (!parsed.success) {
        return res.status(400).json({
          success: false,

          message:
            "Invalid data",

          errors:
            parsed.error.flatten(),
        });
      }

      const settlement =
        await prisma.vendorSettlement.findUnique({
          where: {
            id: req.params.id,
          },
        });

      if (!settlement) {
        return res.status(404).json({
          success: false,
          message:
            "Settlement not found",
        });
      }

      if (
        settlement.status !==
        "PENDING"
      ) {
        return res.status(400).json({
          success: false,

          message:
            "Only pending settlements can be processed",
        });
      }

      const updated =
        await prisma.vendorSettlement.update({
          where: {
            id: settlement.id,
          },

          data: {
            status:
              "PROCESSING",

            notes:
              parsed.data.notes ??
              settlement.notes,
          },
        });

      return res.json({
        success: true,

        message:
          "Settlement is now processing",

        data: {
          ...updated,

          netPayable:
            toNumber(
              updated.netPayable
            ),

          netAmount:
            toNumber(
              updated.netPayable
            ),
        },
      });
    } catch (error) {
      console.error(
        "processSettlement:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          "Failed to process settlement",
      });
    }
  };

// ======================================================
// COMPLETE / PAY SETTLEMENT
// PATCH /api/admin/accounting/settlements/:id/pay
// ======================================================
//
// IMPORTANT:
// This function DOES NOT create a VENDOR_SETTLEMENT
// AccountingEntry.
//
// The VendorSettlement itself is the settlement record.
//
// ======================================================

export const completeSettlement =
  async (req, res) => {
    try {
      const parsed =
        paySettlementSchema.safeParse(
          req.body || {}
        );

      if (!parsed.success) {
        return res.status(400).json({
          success: false,

          message:
            "Invalid payment data",

          errors:
            parsed.error.flatten(),
        });
      }

      // ==================================================
      // LOAD SETTLEMENT
      // ==================================================

      const settlement =
        await prisma.vendorSettlement.findUnique({
          where: {
            id: req.params.id,
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

            items: {
              select: {
                id: true,
                accountingEntryId: true,
                amount: true,
              },
            },
          },
        });

      if (!settlement) {
        return res.status(404).json({
          success: false,
          message:
            "Settlement not found",
        });
      }

      // ==================================================
      // ONLY PROCESSING CAN BE PAID
      // ==================================================

      if (
        settlement.status !==
        "PROCESSING"
      ) {
        return res.status(400).json({
          success: false,

          message:
            "Only processing settlements can be completed",
        });
      }

      // ==================================================
      // MARK SETTLEMENT PAID
      // ==================================================
      //
      // NO ACCOUNTING ENTRY CREATED.
      //
      // The SettlementItem allocations already reserve
      // the source entries.
      //
      // Changing the settlement to PAID means those
      // allocations are now permanently consumed.
      //
      // ==================================================

      const updated =
        await prisma.vendorSettlement.update({
          where: {
            id: settlement.id,
          },

          data: {
            status:
              "PAID",

            paidAt:
              new Date(),

            paymentReference:
              parsed.data
                .paymentReference ??
              settlement.paymentReference,

            notes:
              parsed.data.notes ??
              settlement.notes,
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

            items: {
              include: {
                accountingEntry: true,
              },
            },
          },
        });

      const amount =
        toNumber(
          updated.netPayable
        );

      return res.json({
        success: true,

        message:
          updated.direction ===
          "PAY_VENDOR"
            ? `Rs. ${amount.toFixed(
                2
              )} paid to vendor`
            : `Rs. ${amount.toFixed(
                2
              )} collected from vendor`,

        data: {
          ...updated,

          totalCodAmount:
            toNumber(
              updated.totalCodAmount
            ),

          totalShippingCharge:
            toNumber(
              updated
                .totalShippingCharge
            ),

          totalReturnCharge:
            toNumber(
              updated.totalReturnCharge
            ),

          totalOtherCharges:
            toNumber(
              updated.totalOtherCharges
            ),

          totalCredits:
            toNumber(
              updated.totalCredits
            ),

          totalDebits:
            toNumber(
              updated.totalDebits
            ),

          netPayable:
            toNumber(
              updated.netPayable
            ),

          netAmount:
            toNumber(
              updated.netPayable
            ),

          items:
            updated.items.map(
              (item) => ({
                ...item,

                amount:
                  toNumber(
                    item.amount
                  ),

                accountingEntry:
                  item.accountingEntry
                    ? {
                        ...item.accountingEntry,

                        amount:
                          toNumber(
                            item
                              .accountingEntry
                              .amount
                          ),
                      }
                    : null,
              })
            ),
        },
      });
    } catch (error) {
      console.error(
        "completeSettlement:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          error.message ||
          "Failed to complete settlement",
      });
    }
  };

// ======================================================
// CANCEL SETTLEMENT
// PATCH /api/admin/accounting/settlements/:id/cancel
// ======================================================

export const cancelSettlement =
  async (req, res) => {
    try {
      const settlement =
        await prisma.vendorSettlement.findUnique({
          where: {
            id: req.params.id,
          },
        });

      if (!settlement) {
        return res.status(404).json({
          success: false,
          message:
            "Settlement not found",
        });
      }

      if (
        settlement.status ===
        "PAID"
      ) {
        return res.status(400).json({
          success: false,

          message:
            "Paid settlement cannot be cancelled",
        });
      }

      if (
        settlement.status ===
        "CANCELLED"
      ) {
        return res.status(400).json({
          success: false,

          message:
            "Settlement is already cancelled",
        });
      }

      const updated =
        await prisma.vendorSettlement.update({
          where: {
            id: settlement.id,
          },

          data: {
            status:
              "CANCELLED",
          },
        });

      return res.json({
        success: true,

        message:
          "Settlement cancelled",

        data: {
          ...updated,

          netPayable:
            toNumber(
              updated.netPayable
            ),

          netAmount:
            toNumber(
              updated.netPayable
            ),
        },
      });
    } catch (error) {
      console.error(
        "cancelSettlement:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          "Failed to cancel settlement",
      });
    }
  };

// ======================================================
// BACKWARD COMPATIBLE ALIASES
// ======================================================

export const getVendorUnsettledEntries =
  getUnsettledVendorEntries;