const express = require("express");

const {getOrders} = require("../controller/orders");

const router = express.Router();

router.get("/orders", getOrders);

module.exports = router;
