const e = require("express");
const db = require("../config/db");

const getOrders = async (req, res) => {
  try {
    const orders = await db.execute("SELECT * FROM orders");
    res.json(orders.rows);
  } catch (err) {
    res.status(500).json({error: err.message});
  }
};
exports.getOrders = getOrders;
