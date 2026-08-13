import prisma from "../config/prisma.js";

export const getDashboardStats = async (req, res) => {
  try {
    // =========================
    // SHIPMENT STATISTICS
    // =========================

    // Total Orders
    const totalOrders = await prisma.shipment.count();

    // Pending Orders
    const pendingOrders = await prisma.shipment.count({
      where: {
        status: "PENDING",
      },
    });

    // In Transit Orders
    const inTransitOrders = await prisma.shipment.count({
      where: {
        status: "IN_TRANSIT",
      },
    });

    // Delivered Orders
    const deliveredOrders = await prisma.shipment.count({
      where: {
        status: "DELIVERED",
      },
    });

    // Cancelled Orders
    const cancelledOrders = await prisma.shipment.count({
      where: {
        status: "CANCELLED",
      },
    });

    // =========================
    // MONEY STATISTICS
    // =========================

    // Total Shipping Charges
    const shippingCharges = await prisma.shipment.aggregate({
      _sum: {
        shippingCharge: true,
      },
    });

    const totalShippingCharges =
      shippingCharges._sum.shippingCharge ?? 0;

    // =========================
    // COD STATISTICS
    // =========================

    // COD collected from delivered COD shipments
    const codCollected = await prisma.shipment.aggregate({
      _sum: {
        codAmount: true,
      },
      where: {
        status: "DELIVERED",
        paymentType: "COD",
      },
    });

    const totalCODCollected =
      codCollected._sum.codAmount ?? 0;

    // =========================
    // RIDER STATISTICS
    // =========================

    // Available / Active Riders
    const activeRiders = await prisma.rider.count({
      where: {
        isAvailable: true,
      },
    });

    // =========================
    // VENDOR STATISTICS
    // =========================

    const totalVendors = await prisma.vendor.count();

    // =========================
    // CUSTOMER STATISTICS
    // =========================

    // Your current Role enum does not contain CUSTOMER.
    // So we temporarily set this to 0.
    const totalCustomers = 0;

    // =========================
    // RESPONSE
    // =========================

    res.json({
      totalOrders,
      pendingOrders,
      inTransitOrders,
      deliveredOrders,
      cancelledOrders,

      totalShippingCharges,
      codCollected: totalCODCollected,

      // Currently revenue = shipping charges
      totalRevenue: totalShippingCharges,

      activeRiders,

      totalVendors,
      totalCustomers,
    });

  } catch (err) {
    console.error("DASHBOARD ERROR:", err);

    res.status(500).json({
      message: err.message,
    });
  }
};