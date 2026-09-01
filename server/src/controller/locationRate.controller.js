import prisma from "../config/prisma.js";

// ======================================================
// CREATE LOCATION RATE
// ======================================================

export const createLocationRate = async (
  req,
  res
) => {
  try {
    const {
      locationId,
      deliveryTypeId,
      price,
    } = req.body;

    if (!locationId) {
      return res.status(400).json({
        message: "Location is required",
      });
    }

    if (!deliveryTypeId) {
      return res.status(400).json({
        message: "Delivery type is required",
      });
    }

    if (
      price === undefined ||
      price === null ||
      Number(price) < 0
    ) {
      return res.status(400).json({
        message: "Valid price is required",
      });
    }

    // Check location

    const location = await prisma.location.findUnique({
      where: {
        id: Number(locationId),
      },
    });

    if (!location) {
      return res.status(404).json({
        message: "Location not found",
      });
    }

    // Check delivery type

    const deliveryType =
      await prisma.deliveryType.findUnique({
        where: {
          id: Number(deliveryTypeId),
        },
      });

    if (!deliveryType) {
      return res.status(404).json({
        message: "Delivery type not found",
      });
    }

    // Check duplicate

    const existing =
      await prisma.locationRate.findUnique({
        where: {
          locationId_deliveryTypeId: {
            locationId: Number(locationId),
            deliveryTypeId: Number(
              deliveryTypeId
            ),
          },
        },
      });

    if (existing) {
      return res.status(409).json({
        message:
          "A price already exists for this location and delivery type",
      });
    }

    // Create rate

    const rate = await prisma.locationRate.create({
      data: {
        locationId: Number(locationId),

        deliveryTypeId: Number(
          deliveryTypeId
        ),

        price: Number(price),
      },

      include: {
        location: true,
        deliveryType: true,
      },
    });

    return res.status(201).json({
      message: "Location rate created successfully",
      rate,
    });
  } catch (error) {
    console.error(
      "Create location rate error:",
      error
    );

    return res.status(500).json({
      message: "Failed to create location rate",
    });
  }
};

// ======================================================
// GET ALL RATES
// ======================================================

export const getLocationRates = async (
  req,
  res
) => {
  try {
    const rates =
      await prisma.locationRate.findMany({
        include: {
          location: true,
          deliveryType: true,
        },

        orderBy: {
          createdAt: "desc",
        },
      });

    return res.status(200).json(rates);
  } catch (error) {
    console.error(
      "Get location rates error:",
      error
    );

    return res.status(500).json({
      message: "Failed to get location rates",
    });
  }
};

// ======================================================
// GET ONE RATE
// ======================================================

export const getLocationRateById = async (
  req,
  res
) => {
  try {
    const id = Number(req.params.id);

    if (!id) {
      return res.status(400).json({
        message: "Invalid rate ID",
      });
    }

    const rate =
      await prisma.locationRate.findUnique({
        where: {
          id,
        },

        include: {
          location: true,
          deliveryType: true,
        },
      });

    if (!rate) {
      return res.status(404).json({
        message: "Location rate not found",
      });
    }

    return res.status(200).json(rate);
  } catch (error) {
    console.error(
      "Get location rate error:",
      error
    );

    return res.status(500).json({
      message: "Failed to get location rate",
    });
  }
};

// ======================================================
// GET RATES BY LOCATION
// ======================================================

export const getRatesByLocation = async (
  req,
  res
) => {
  try {
    const locationId = Number(
      req.params.locationId
    );

    if (!locationId) {
      return res.status(400).json({
        message: "Invalid location ID",
      });
    }

    const rates =
      await prisma.locationRate.findMany({
        where: {
          locationId,
        },

        include: {
          location: true,
          deliveryType: true,
        },

        orderBy: {
          price: "asc",
        },
      });

    return res.status(200).json(rates);
  } catch (error) {
    console.error(
      "Get rates by location error:",
      error
    );

    return res.status(500).json({
      message: "Failed to get rates",
    });
  }
};

// ======================================================
// UPDATE RATE
// ======================================================

export const updateLocationRate = async (
  req,
  res
) => {
  try {
    const id = Number(req.params.id);

    const {
      locationId,
      deliveryTypeId,
      price,
    } = req.body;

    if (!id) {
      return res.status(400).json({
        message: "Invalid rate ID",
      });
    }

    if (!locationId || !deliveryTypeId) {
      return res.status(400).json({
        message:
          "Location and delivery type are required",
      });
    }

    if (
      price === undefined ||
      price === null ||
      Number(price) < 0
    ) {
      return res.status(400).json({
        message: "Valid price is required",
      });
    }

    const existing =
      await prisma.locationRate.findUnique({
        where: {
          id,
        },
      });

    if (!existing) {
      return res.status(404).json({
        message: "Location rate not found",
      });
    }

    const duplicate =
      await prisma.locationRate.findFirst({
        where: {
          locationId: Number(locationId),
          deliveryTypeId: Number(
            deliveryTypeId
          ),
          NOT: {
            id,
          },
        },
      });

    if (duplicate) {
      return res.status(409).json({
        message:
          "This location and delivery type already has a rate",
      });
    }

    const rate =
      await prisma.locationRate.update({
        where: {
          id,
        },

        data: {
          locationId: Number(locationId),

          deliveryTypeId: Number(
            deliveryTypeId
          ),

          price: Number(price),
        },

        include: {
          location: true,
          deliveryType: true,
        },
      });

    return res.status(200).json({
      message: "Location rate updated successfully",
      rate,
    });
  } catch (error) {
    console.error(
      "Update location rate error:",
      error
    );

    return res.status(500).json({
      message: "Failed to update location rate",
    });
  }
};

// ======================================================
// DELETE RATE
// ======================================================

export const deleteLocationRate = async (
  req,
  res
) => {
  try {
    const id = Number(req.params.id);

    if (!id) {
      return res.status(400).json({
        message: "Invalid rate ID",
      });
    }

    const existing =
      await prisma.locationRate.findUnique({
        where: {
          id,
        },
      });

    if (!existing) {
      return res.status(404).json({
        message: "Location rate not found",
      });
    }

    await prisma.locationRate.delete({
      where: {
        id,
      },
    });

    return res.status(200).json({
      message: "Location rate deleted successfully",
    });
  } catch (error) {
    console.error(
      "Delete location rate error:",
      error
    );

    return res.status(500).json({
      message: "Failed to delete location rate",
    });
  }
};