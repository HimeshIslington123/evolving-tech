import prisma from "../config/prisma.js";

// ======================================================
// CREATE LOCATION
// ======================================================

export const createLocation = async (req, res) => {
  try {
    const { name, zone } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        message: "Location name is required",
      });
    }

    if (!zone) {
      return res.status(400).json({
        message: "Delivery zone is required",
      });
    }

    if (!["INSIDE_VALLEY", "OUTSIDE_VALLEY"].includes(zone)) {
      return res.status(400).json({
        message:
          "Zone must be INSIDE_VALLEY or OUTSIDE_VALLEY",
      });
    }

    const existingLocation = await prisma.location.findUnique({
      where: {
        name: name.trim(),
      },
    });

    if (existingLocation) {
      return res.status(409).json({
        message: "Location already exists",
      });
    }

    const location = await prisma.location.create({
      data: {
        name: name.trim(),
        zone,
      },
    });

    return res.status(201).json({
      message: "Location created successfully",
      location,
    });
  } catch (error) {
    console.error("Create location error:", error);

    return res.status(500).json({
      message: "Failed to create location",
    });
  }
};

// ======================================================
// GET ALL LOCATIONS
// ======================================================

export const getLocations = async (req, res) => {
  try {
    const locations = await prisma.location.findMany({
      include: {
        rates: {
          include: {
            deliveryType: true,
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    });

    return res.status(200).json(locations);
  } catch (error) {
    console.error("Get locations error:", error);

    return res.status(500).json({
      message: "Failed to get locations",
    });
  }
};

// ======================================================
// GET LOCATION BY ID
// ======================================================

export const getLocationById = async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!id) {
      return res.status(400).json({
        message: "Invalid location ID",
      });
    }

    const location = await prisma.location.findUnique({
      where: {
        id,
      },
      include: {
        rates: {
          include: {
            deliveryType: true,
          },
        },
      },
    });

    if (!location) {
      return res.status(404).json({
        message: "Location not found",
      });
    }

    return res.status(200).json(location);
  } catch (error) {
    console.error("Get location by ID error:", error);

    return res.status(500).json({
      message: "Failed to get location",
    });
  }
};

// ======================================================
// UPDATE LOCATION
// ======================================================

export const updateLocation = async (req, res) => {
  try {
    const id = Number(req.params.id);

    const { name, zone } = req.body;

    if (!id) {
      return res.status(400).json({
        message: "Invalid location ID",
      });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({
        message: "Location name is required",
      });
    }

    if (!zone) {
      return res.status(400).json({
        message: "Delivery zone is required",
      });
    }

    if (!["INSIDE_VALLEY", "OUTSIDE_VALLEY"].includes(zone)) {
      return res.status(400).json({
        message:
          "Zone must be INSIDE_VALLEY or OUTSIDE_VALLEY",
      });
    }

    const location = await prisma.location.findUnique({
      where: {
        id,
      },
    });

    if (!location) {
      return res.status(404).json({
        message: "Location not found",
      });
    }

    const duplicate = await prisma.location.findFirst({
      where: {
        name: name.trim(),
        NOT: {
          id,
        },
      },
    });

    if (duplicate) {
      return res.status(409).json({
        message: "Another location already has this name",
      });
    }

    const updatedLocation = await prisma.location.update({
      where: {
        id,
      },
      data: {
        name: name.trim(),
        zone,
      },
    });

    return res.status(200).json({
      message: "Location updated successfully",
      location: updatedLocation,
    });
  } catch (error) {
    console.error("Update location error:", error);

    return res.status(500).json({
      message: "Failed to update location",
    });
  }
};

// ======================================================
// DELETE LOCATION
// ======================================================

export const deleteLocation = async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!id) {
      return res.status(400).json({
        message: "Invalid location ID",
      });
    }

    const location = await prisma.location.findUnique({
      where: {
        id,
      },
    });

    if (!location) {
      return res.status(404).json({
        message: "Location not found",
      });
    }

    await prisma.location.delete({
      where: {
        id,
      },
    });

    return res.status(200).json({
      message: "Location deleted successfully",
    });
  } catch (error) {
    console.error("Delete location error:", error);

    return res.status(500).json({
      message: "Failed to delete location",
    });
  }
};