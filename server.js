const express = require("express");
const cors = require("cors");
const app = express();

const ordersRoutes = require("./routes/ordersRoutes");
const productsRoutes = require("./routes/productsRoutes");

PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use("/api", ordersRoutes);
app.use("/api", productsRoutes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
