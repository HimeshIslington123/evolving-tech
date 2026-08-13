import prisma from "../config/prisma.js";

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

    res.json(vendors);
  } catch (err) {
    res.status(500).json({
      message: "Server Error",
    });
  }
};



export const getVendorDashboard = async (req, res) => {
  try {
    // --------------------------------------------------
    // GET VENDOR
    // --------------------------------------------------

    // Assuming req.user.id is the logged-in User ID
    const vendor = await prisma.vendor.findUnique({
      where: {
        userId: 2,
      },
    });

    if (!vendor) {
      return res.status(404).json({
        message: "Vendor not found",
      });
    }

    const vendorId = vendor.id;

    // --------------------------------------------------
    // TOTAL ORDERS
    // --------------------------------------------------

    const totalOrders = await prisma.shipment.count({
      where: {
        vendorId,
      },
    });

    // --------------------------------------------------
    // ORDER STATUS COUNTS
    // --------------------------------------------------

    const pendingOrders = await prisma.shipment.count({
      where: {
        vendorId,
        status: "PENDING",
      },
    });

    const receivedOrders = await prisma.shipment.count({
      where: {
        vendorId,
        status: "RECEIVED",
      },
    });

    const processingOrders = await prisma.shipment.count({
      where: {
        vendorId,
        status: "PROCESSING",
      },
    });

    const warehouseOrders = await prisma.shipment.count({
      where: {
        vendorId,
        status: "IN_WAREHOUSE",
      },
    });

    const dispatchedOrders = await prisma.shipment.count({
      where: {
        vendorId,
        status: "DISPATCHED",
      },
    });

    const inTransitOrders = await prisma.shipment.count({
      where: {
        vendorId,
        status: "IN_TRANSIT",
      },
    });

    const arrivedOrders = await prisma.shipment.count({
      where: {
        vendorId,
        status: "ARRIVED",
      },
    });

    const outForDeliveryOrders = await prisma.shipment.count({
      where: {
        vendorId,
        status: "OUT_FOR_DELIVERY",
      },
    });

    const deliveredOrders = await prisma.shipment.count({
      where: {
        vendorId,
        status: "DELIVERED",
      },
    });

    const cancelledOrders = await prisma.shipment.count({
      where: {
        vendorId,
        status: "CANCELLED",
      },
    });

    const returnedOrders = await prisma.shipment.count({
      where: {
        vendorId,
        status: "RETURNED",
      },
    });

    // --------------------------------------------------
    // FINANCIAL STATISTICS
    // --------------------------------------------------

    // Total COD amount across all vendor shipments
    const totalCOD = await prisma.shipment.aggregate({
      _sum: {
        codAmount: true,
      },
      where: {
        vendorId,
        paymentType: "COD",
      },
    });

    const totalCODAmount = totalCOD._sum.codAmount ?? 0;

    // COD from delivered shipments
    const deliveredCOD = await prisma.shipment.aggregate({
      _sum: {
        codAmount: true,
      },
      where: {
        vendorId,
        paymentType: "COD",
        status: "DELIVERED",
      },
    });

    const totalCODCollected =
      deliveredCOD._sum.codAmount ?? 0;

    // Total shipping charges
    const shippingCharges = await prisma.shipment.aggregate({
      _sum: {
        shippingCharge: true,
      },
      where: {
        vendorId,
      },
    });

    const totalShippingCharges =
      shippingCharges._sum.shippingCharge ?? 0;

    // Average shipping charge
    const averageShippingCharge = await prisma.shipment.aggregate({
      _avg: {
        shippingCharge: true,
      },
      where: {
        vendorId,
      },
    });

    const averageCharge =
      averageShippingCharge._avg.shippingCharge ?? 0;

    // --------------------------------------------------
    // RECENT SHIPMENTS
    // --------------------------------------------------

    const recentShipments = await prisma.shipment.findMany({
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
        status: true,
        createdAt: true,
      },
    });

    // --------------------------------------------------
    // RESPONSE
    // --------------------------------------------------

    res.json({
      vendor: {
        id: vendor.id,
        companyName: vendor.companyName,
        contactId: vendor.contactId,
        location: vendor.location,
      },

      orders: {
        total: totalOrders,
        pending: pendingOrders,
        received: receivedOrders,
        processing: processingOrders,
        inWarehouse: warehouseOrders,
        dispatched: dispatchedOrders,
        inTransit: inTransitOrders,
        arrived: arrivedOrders,
        outForDelivery: outForDeliveryOrders,
        delivered: deliveredOrders,
        cancelled: cancelledOrders,
        returned: returnedOrders,
      },

      finance: {
        totalCOD: totalCODAmount,
        codCollected: totalCODCollected,
        totalShippingCharges,
        averageShippingCharge: Number(
          averageCharge.toFixed(2)
        ),

        // There is currently no shippingCost
        // field in your Prisma Shipment model.
        totalShippingCost: null,

        // Currently using shipping charges as revenue
        totalRevenue: totalShippingCharges,
      },

      recentShipments,
    });

  } catch (err) {
    console.error("VENDOR DASHBOARD ERROR:", err);

    res.status(500).json({
      message: err.message,
    });
  }
};