const express = require("express");
const {
  getCategoriesProducts,
  getSizesCategory,
  addProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  getFilteredProducts,
  importProducts,
} = require("../controller/productsController");
const generateTemplateFile = require("../utils/generateTemplateFile");
const fs = require("fs");

const multer = require("multer");
const storage = multer.memoryStorage();
const upload = multer({storage});

const router = express.Router();

router.get("/products/categories", getCategoriesProducts);
router.get("/products/sizes/:id", getSizesCategory);
router.post("/products/add", addProduct);
router.get("/products", getProducts);
router.get("/products/template", generateTemplateFile);

router.get("/products/:id", getProductById);
router.put("/products/update", updateProduct);
router.delete("/products/delete/:id", deleteProduct);
router.get("/products/filter", getFilteredProducts);
router.post(
  "/products/import",
  upload.fields([
    {name: "excel", maxCount: 1},
    {name: "zip", maxCount: 1},
  ]),
  importProducts
);

module.exports = router;
