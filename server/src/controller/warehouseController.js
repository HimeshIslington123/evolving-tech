
import prisma from "../config/prisma.js";



export const getWarehouses = async (req, res) => {
  try {
    const search =
      typeof req.query.search === "string"
        ? req.query.search.trim()
        : "";

    const warehouses = await prisma.warehouse.findMany({
      where: search
        ? {
            OR: [
              {
                name: {
                  contains: search,
                  mode: "insensitive",
                },
              },
              {
                city: {
                  contains: search,
                  mode: "insensitive",
                },
              },
            ],
          }
        : undefined,
      orderBy: {
        createdAt: "desc",
      },
      include: {
        _count: {
          select: {
            shipments: true,
            staff: true,
          },
        },
      },
    });

    return res.status(200).json({
      success: true,
      count: warehouses.length,
      warehouses,
    });
  } catch (error) {
    console.error("Get warehouses error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch warehouses.",
    });
  }
};

// ======================================================
// GET SINGLE WAREHOUSE
// GET /api/warehouse/:id
// ======================================================

export const getWarehouseById = async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid warehouse ID.",
      });
    }

    const warehouse = await prisma.warehouse.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            shipments: true,
            staff: true,
          },
        },
      },
    });

    if (!warehouse) {
      return res.status(404).json({
        success: false,
        message: "Warehouse not found.",
      });
    }

    return res.status(200).json({
      success: true,
      warehouse,
    });
  } catch (error) {
    console.error("Get warehouse error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch warehouse.",
    });
  }
};

// ======================================================
// CREATE WAREHOUSE
// POST /api/warehouse
// Body: { "name": "Main Warehouse", "city": "Kathmandu" }
// ======================================================

export const createWarehouse = async (req, res) => {
  try {
    const { name, city } = req.body;

    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof city !== "string" ||
      !city.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Warehouse name and city are required.",
      });
    }

    const warehouse = await prisma.warehouse.create({
      data: {
        name: name.trim(),
        city: city.trim(),
      },
    });

    return res.status(201).json({
      success: true,
      message: "Warehouse created successfully.",
      warehouse,
    });
  } catch (error) {
    console.error("Create warehouse error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create warehouse.",
    });
  }
};

// ======================================================
// UPDATE WAREHOUSE
// PUT /api/warehouse/:id
// Body: { "name": "Updated Warehouse", "city": "Lalitpur" }
// ======================================================

export const updateWarehouse = async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid warehouse ID.",
      });
    }

    const { name, city } = req.body;

    if (
      name !== undefined &&
      (typeof name !== "string" || !name.trim())
    ) {
      return res.status(400).json({
        success: false,
        message: "Warehouse name cannot be empty.",
      });
    }

    if (
      city !== undefined &&
      (typeof city !== "string" || !city.trim())
    ) {
      return res.status(400).json({
        success: false,
        message: "Warehouse city cannot be empty.",
      });
    }

    if (name === undefined && city === undefined) {
      return res.status(400).json({
        success: false,
        message: "Provide a warehouse name or city to update.",
      });
    }

    const existing = await prisma.warehouse.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Warehouse not found.",
      });
    }

    const warehouse = await prisma.warehouse.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(city !== undefined && { city: city.trim() }),
      },
    });

    return res.status(200).json({
      success: true,
      message: "Warehouse updated successfully.",
      warehouse,
    });
  } catch (error) {
    console.error("Update warehouse error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update warehouse.",
    });
  }
};

// ======================================================
// DELETE WAREHOUSE
// DELETE /api/warehouse/:id
// ======================================================

export const deleteWarehouse = async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid warehouse ID.",
      });
    }

    const warehouse = await prisma.warehouse.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            shipments: true,
            staff: true,
          },
        },
      },
    });

    if (!warehouse) {
      return res.status(404).json({
        success: false,
        message: "Warehouse not found.",
      });
    }

    // Avoid deleting a warehouse that still has linked records.
    if (
      warehouse._count.shipments > 0 ||
      warehouse._count.staff > 0
    ) {
      return res.status(409).json({
        success: false,
        message:
          "Cannot delete this warehouse because shipments or staff are assigned to it. Reassign them first.",
        linkedShipments: warehouse._count.shipments,
        linkedStaff: warehouse._count.staff,
      });
    }

    await prisma.warehouse.delete({
      where: { id },
    });

    return res.status(200).json({
      success: true,
      message: "Warehouse deleted successfully.",
    });
  } catch (error) {
    console.error("Delete warehouse error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete warehouse.",
    });
  }
};
