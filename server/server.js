import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import pool from "./db.js";
import authRoutes from "./src/routes/auth.routes.js";
import shipmentRoutes from "./src/routes/shipment.routes.js";
import vendorRoutes from "./src/routes/vendor.routes.js"
import locationRateRoutes from "./src/routes/location.routes.js"
import riderRoutes from "./src/routes/rider.routes.js"
import dashboardRoutes from "./src/routes/dashboard.routes.js"

dotenv.config();

const app = express();

app.use(express.json());
app.use(cors());

app.use("/api/shipment", shipmentRoutes);

app.use("/api/auth", authRoutes);

app.use("/api/vendor", vendorRoutes);

app.use("/api/locationRate", locationRateRoutes);
app.use("/api/rider", riderRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.get("/", (req, res) => {
  res.send("Server Running");
});

app.get("/test-db", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Database connection failed",
    });
  }
});

app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});
