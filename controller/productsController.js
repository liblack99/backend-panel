const db = require("../config/db");
const XLSX = require("xlsx");
const {createSizeIfNotExists} = require("./stockController");
const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");
const cloudinary = require("../config/cloudinary");
const {v4: uuidv4} = require("uuid");

const getCategoriesProducts = async (req, res) => {
  try {
    const categories = await db.execute("SELECT * FROM categories");

    if (categories.rows.length === 0) {
      return res.status(200).json([]);
    }

    res.status(200).json(categories.rows);
  } catch (err) {
    res.status(500).json({error: err.message});
  }
};

const getSizesCategory = async (req, res) => {
  const {id} = req.params;

  try {
    const sizes = await db.execute(
      "SELECT * FROM sizes WHERE category_id = ?",
      [id]
    );

    if (sizes.rows.length === 0) {
      return res.status(200).json([]);
    }

    res.status(200).json(sizes.rows);
  } catch (err) {
    res.status(500).json({error: err.message});
  }
};

const addProduct = async (req, res) => {
  const {name, description, price, categoryId, variants} = req.body;

  console.log("Received request body:", req.body);

  try {
    const {rows} = await db.execute(
      "INSERT INTO products (name, description, price, category_id, created_at, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING *",
      [name, description, price, categoryId]
    );
    const productId = rows[0].id;

    for (const variant of variants) {
      try {
        const variantQuery = await db.execute(
          "INSERT INTO product_variants (product_id, color_hex,created_at, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING *",
          [productId, variant.color]
        );

        const variantId = variantQuery.rows[0].id;

        for (const image of variant.images) {
          console.log("Inserting image:", image);
          try {
            await db.execute(
              "INSERT INTO images (variant_id, url, order_index) VALUES (?, ?, ?)",
              [variantId, image.url, image.order_index]
            );
          } catch (imageError) {
            console.error(
              "Error uploading images or inserting into database:",
              imageError
            );
            throw new Error("Failed to upload and save images");
          }
        }

        for (const size of variant.stock) {
          try {
            await db.execute(
              "INSERT INTO stock (variant_id, size_id, quantity) VALUES (?, ?, ?)",
              [variantId, size.id, size.quantity]
            );
          } catch (sizeError) {
            console.error("Error inserting variant sizes:", sizeError);
            throw new Error("Failed to insert variant sizes");
          }
        }
      } catch (variantError) {
        console.error("Error inserting variant:", variantError);
        throw new Error("Failed to insert variant");
      }
    }

    res.status(200).json({message: "Product added successfully"});
  } catch (err) {
    console.error("Error adding product:", err);
    res.status(500).json({error: err.message});
  }
};

const getProducts = async (req, res) => {
  try {
    // Obtener los parámetros 'limit' y 'page' desde la consulta
    const limit = parseInt(req.query.limit) || 10;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * limit;

    // Consulta SQL
    const query = `
      SELECT 
        p.id AS product_id,
        p.name AS product_name,
        p.category_id AS product_categoryId,
        p.description AS product_description,
        p.price AS product_price,
        pv.id AS variant_id,
        pv.color_hex AS variant_color,
        i.id AS image_id,
        i.url, i.order_index,
        s.size_id, s.quantity, sz.name AS size_name
      FROM 
        products p
      LEFT JOIN product_variants pv ON pv.product_id = p.id
      LEFT JOIN images i ON i.variant_id = pv.id
      LEFT JOIN stock s ON s.variant_id = pv.id
      LEFT JOIN sizes sz ON sz.id = s.size_id
      LIMIT ? OFFSET ?
    `;

    const {rows} = await db.execute(query, [limit, offset]);

    // Usar un objeto para mapear productos por `product_id`
    const productMap = {};

    rows.forEach((row) => {
      // Si el producto no está en el mapa, agregarlo
      if (!productMap[row.product_id]) {
        productMap[row.product_id] = {
          id: row.product_id,
          categoryId: row.product_categoryId,
          name: row.product_name,
          description: row.product_description,
          price: row.product_price,
          variants: {},
        };
      }

      const product = productMap[row.product_id];

      // Si la variante no está en el producto, agregarla
      if (!product.variants[row.variant_id]) {
        product.variants[row.variant_id] = {
          id: row.variant_id,
          color: row.variant_color,
          images: new Map(), // Usamos un Map para evitar imágenes duplicadas
          stock: [],
        };
      }

      const variant = product.variants[row.variant_id];

      // Usamos un Map para verificar si la imagen ya existe
      if (!variant.images.has(row.image_id)) {
        variant.images.set(row.image_id, {
          id: row.image_id,
          url: row.url,
          order_index: row.order_index,
        });
      }

      // Agregar el stock y las tallas
      if (!variant.stock.some((s) => s.id === row.size_id)) {
        variant.stock.push({
          id: row.size_id,
          name: row.size_name,
          quantity: row.quantity,
        });
      }
    });

    // Convertir el mapa de productos a un array de productos
    const products = Object.values(productMap).map((product) => ({
      ...product,
      variants: Object.values(product.variants).map((variant) => ({
        ...variant,
        images: Array.from(variant.images.values()), // Convertir Map a array
      })),
    }));
    console.log("Products:", products);
    // Responder con los productos y la paginación
    res.status(200).json({
      message: "Products fetched successfully",
      data: products,
      pagination: {
        limit,
        page,
        totalPages: Math.ceil(rows.length / limit), // Calcular el número total de páginas
      },
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({error: "Internal server error"});
  }
};

const getProductById = async (req, res) => {
  const {id} = req.params;
  console.log("Received request for product ID:", id);

  try {
    const query = `
      SELECT 
        p.id AS product_id,
        p.name AS product_name,
        p.category_id AS product_categoryId,
        p.description AS product_description,
        p.price AS product_price,
        pv.id AS variant_id,
        pv.color_hex AS variant_color,
        i.id AS image_id,
        i.url, i.order_index,
        s.size_id, s.quantity, sz.name AS size_name
      FROM 
        products p
      LEFT JOIN product_variants pv ON pv.product_id = p.id
      LEFT JOIN images i ON i.variant_id = pv.id
      LEFT JOIN stock s ON s.variant_id = pv.id
      LEFT JOIN sizes sz ON sz.id = s.size_id
      WHERE p.id = ?
    `;

    const {rows} = await db.execute(query, [id]);

    if (rows.length === 0) {
      return res.status(404).json({error: "Product not found"});
    }

    // Usar un objeto para mapear el producto
    const product = {
      id: rows[0].product_id,
      name: rows[0].product_name,
      categoryId: rows[0].product_categoryId,
      description: rows[0].product_description,
      price: rows[0].product_price,
      variants: {},
    };

    rows.forEach((row) => {
      if (!product.variants[row.variant_id]) {
        product.variants[row.variant_id] = {
          id: row.variant_id,
          color: row.variant_color,
          images: new Map(),
          stock: [],
        };
      }

      const variant = product.variants[row.variant_id];

      if (!variant.images.has(row.image_id)) {
        variant.images.set(row.image_id, {
          id: row.image_id,
          url: row.url,
          order_index: row.order_index,
        });
      }

      if (!variant.stock.some((s) => s.id === row.size_id)) {
        variant.stock.push({
          id: row.size_id,
          name: row.size_name,
          quantity: row.quantity,
        });
      }
    });

    // Convertir el mapa de imágenes a un array
    product.variants = Object.values(product.variants).map((variant) => ({
      ...variant,
      images: Array.from(variant.images.values()),
    }));

    res.status(200).json(product);
  } catch (error) {
    console.error("Error fetching product by ID:", error);
    res.status(500).json({error: "Internal server error"});
  }
};
const updateProduct = async (req, res) => {
  const {id, name, description, price, categoryId, variants} = req.body;

  if (!id) {
    return res.status(400).json({error: "Product ID is required"});
  }

  try {
    try {
      await db.execute(
        "UPDATE products SET name = ?, description = ?, price = ?, category_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [name, description, price, categoryId, id]
      );
    } catch (error) {
      console.error("Error updating product details:", error);
      return res.status(500).json({error: "Failed to update product details"});
    }

    // Obtener variantes actuales en la base de datos
    let existingVariants = [];
    try {
      const {rows} = await db.execute(
        "SELECT id FROM product_variants WHERE product_id = ?",
        [id]
      );
      existingVariants = rows;
    } catch (error) {
      console.error("Error fetching existing variants:", error);
      return res.status(500).json({error: "Failed to fetch existing variants"});
    }

    const incomingVariantIds = variants.map((variant) => variant.id);

    // Encontrar y eliminar variantes que ya no existen en req.body
    for (const variant of existingVariants) {
      if (!incomingVariantIds.includes(variant.id)) {
        try {
          await db.execute("DELETE FROM images WHERE variant_id = ?", [
            variant.id,
          ]);
          await db.execute("DELETE FROM stock WHERE variant_id = ?", [
            variant.id,
          ]);
          await db.execute("DELETE FROM product_variants WHERE id = ?", [
            variant.id,
          ]);
        } catch (error) {
          console.error("Error deleting variant:", error);
          return res.status(500).json({error: "Failed to delete variant"});
        }
      }
    }

    // Insertar o actualizar variantes
    for (const variant of variants) {
      try {
        if (variant.id) {
          await db.execute(
            "UPDATE product_variants SET color_hex = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            [variant.color, variant.id]
          );
        } else {
          const {rows: variantRows} = await db.execute(
            "INSERT INTO product_variants (product_id, color_hex, created_at, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING id",
            [id, variant.color]
          );
          variant.id = variantRows[0].id;
        }
      } catch (error) {
        console.error("Error updating/inserting variant:", error);
        return res.status(500).json({error: "Failed to update/insert variant"});
      }

      // Insertar o actualizar imágenes
      for (const image of variant.images) {
        try {
          if (image.id) {
            await db.execute(
              "UPDATE images SET url= ?, order_index = ? WHERE id = ?",
              [image.url, image.order_index, image.id]
            );
          } else {
            await db.execute(
              "INSERT INTO images (variant_id, url, order_index) VALUES (?, ?, ?)",
              [variant.id, image.url, image.order_index]
            );
          }
        } catch (error) {
          console.error("Error updating/inserting image:", error);
          return res.status(500).json({error: "Failed to update/insert image"});
        }
      }

      // Insertar o actualizar stock
      for (const size of variant.stock) {
        try {
          await db.execute(
            "INSERT INTO stock (variant_id, size_id, quantity) VALUES (?, ?, ?) ON CONFLICT(variant_id, size_id) DO UPDATE SET quantity = ?",
            [variant.id, size.id, size.quantity, size.quantity]
          );
        } catch (error) {
          console.error("Error updating/inserting stock:", error);
          return res.status(500).json({error: "Failed to update/insert stock"});
        }
      }
    }

    res.status(200).json({message: "Product updated successfully"});
  } catch (err) {
    console.error("Unexpected error updating product:", err);
    res.status(500).json({error: "Unexpected error updating product"});
  }
};

const deleteProduct = async (req, res) => {
  const {id} = req.params; // ID del producto a eliminar

  if (!id) {
    return res.status(400).json({error: "Product ID is required"});
  }

  try {
    // Verificar si el producto existe
    const {rows: productExists} = await db.execute(
      "SELECT id FROM products WHERE id = ?",
      [id]
    );

    if (productExists.length === 0) {
      return res.status(404).json({error: "Product not found"});
    }

    // Eliminar imágenes asociadas a las variantes del producto
    await db.execute(
      "DELETE FROM images WHERE variant_id IN (SELECT id FROM product_variants WHERE product_id = ?)",
      [id]
    );

    // Eliminar stock asociado a las variantes del producto
    await db.execute(
      "DELETE FROM stock WHERE variant_id IN (SELECT id FROM product_variants WHERE product_id = ?)",
      [id]
    );

    // Eliminar variantes del producto
    await db.execute("DELETE FROM product_variants WHERE product_id = ?", [id]);

    // Eliminar el producto
    await db.execute("DELETE FROM products WHERE id = ?", [id]);

    res.status(200).json({message: "Product deleted successfully"});
  } catch (error) {
    console.error("Error deleting product:", error);
    res.status(500).json({error: "Failed to delete product"});
  }
};

const getFilteredProducts = async (req, res) => {
  try {
    const {name, category_id, color, min_stock} = req.query;

    let query = `
      SELECT 
          p.id AS product_id, 
          p.name, 
          p.description, 
          p.price, 
          p.category_id,
          json_group_array(
              json_object(
                  'id', pv.id,
                  'color', pv.color_hex,
                  'images', (
                      SELECT json_group_array(json_object(
                          'id', i.id,
                          'mobile', i.mobile,
                          'tablet', i.tablet,
                          'desktop', i.desktop,
                          'order_index', i.order_index
                      )) FROM images i WHERE i.variant_id = pv.id
                  ),
                  'stock', (
                      SELECT json_group_array(json_object(
                          'size_id', s.size_id,
                          'quantity', s.quantity
                      )) FROM stock s WHERE s.variant_id = pv.id
                  )
              )
          ) AS variants
      FROM products p
      LEFT JOIN product_variants pv ON p.id = pv.product_id
      LEFT JOIN (
          SELECT variant_id, SUM(quantity) AS total_stock 
          FROM stock 
          GROUP BY variant_id
      ) AS stock_total ON pv.id = stock_total.variant_id
      WHERE 1=1
    `;

    const params = [];

    if (name) {
      query += ` AND p.name LIKE ?`;
      params.push(`%${name}%`);
    }

    if (category_id) {
      query += ` AND p.category_id = ?`;
      params.push(category_id);
    }

    if (color) {
      query += ` AND pv.color_hex = ?`;
      params.push(color);
    }

    if (min_stock) {
      query += ` AND stock_total.total_stock >= ?`;
      params.push(min_stock);
    }

    query += ` GROUP BY p.id`;

    const products = await db.execute(query, params);

    res.json(products.rows); // Turso devuelve los datos en `rows`
  } catch (error) {
    console.error("Error fetching filtered products:", error);
    res.status(500).json({error: "Failed to fetch products"});
  }
};

const getCategoryId = async (categoryName) => {
  try {
    const result = await db.execute({
      sql: "SELECT id FROM categories WHERE name = ?",
      args: [categoryName],
    });

    const id = result.rows.length > 0 ? result.rows[0].id : null;
    console.log("✅ Category ID found:", id, "for", categoryName);
    return id;
  } catch (err) {
    console.error("❌ Error in getCategoryId:", err);
    throw new Error("Error in getCategoryId: " + err.message);
  }
};
const createCategoryIfNotExists = async (categoryName) => {
  try {
    const categoryId = await getCategoryId(categoryName);

    if (!categoryId) {
      console.log("ℹ️ Category doesn't exist, creating:", categoryName);

      const result = await db.execute({
        sql: "INSERT INTO categories (name) VALUES (?) RETURNING id",
        args: [categoryName],
      });

      const newId = result.rows[0].id;
      console.log("✅ Category created with ID:", newId);
      return newId;
    }

    return categoryId;
  } catch (err) {
    console.error("❌ Error in createCategoryIfNotExists:", err);
    throw new Error("Error in createCategoryIfNotExists: " + err.message);
  }
};

const importProducts = async (req, res) => {
  try {
    // Leer archivo Excel
    const workbook = XLSX.read(req.files.excel[0].buffer, {type: "buffer"});
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(sheet);

    // Crear carpeta temporal para imágenes
    const tempDir = path.join(__dirname, "temp", uuidv4());
    fs.mkdirSync(tempDir, {recursive: true});
    console.log("📂 Carpeta temporal creada:", tempDir);

    // Extraer imágenes del archivo ZIP
    let imageFoldersMap = {};
    try {
      const zip = new AdmZip(req.files.zip[0].buffer);
      zip.extractAllTo(tempDir, true);
      console.log("✅ ZIP extraído correctamente");

      const folders = fs.readdirSync(tempDir);
      console.log("📁 Carpetas encontradas en el ZIP:", folders);

      for (const folder of folders) {
        const folderPath = path.join(tempDir, folder);
        if (fs.lstatSync(folderPath).isDirectory()) {
          const images = fs
            .readdirSync(folderPath)
            .filter((file) => /\.(jpg|jpeg|png)$/i.test(file))
            .map((file) => {
              console.log("🖼️ Archivo encontrado:", file);
              const orderIndex = parseInt(file.split(".")[0]);
              const filePath = path.join(folderPath, file);
              console.log("🖼️ Imagen encontrada:", filePath);
              return {filePath, orderIndex};
            });

          imageFoldersMap[folder] = images;
          console.log(
            "🖼️ Imágenes encontradas en la carpeta:",
            imageFoldersMap[folder]
          );
        }
      }

      console.log("🗺️ Mapa de carpetas con imágenes:", imageFoldersMap);
    } catch (zipError) {
      console.error("❌ Error al leer o extraer el archivo ZIP:", zipError);
      return res.status(400).json({error: "Error leyendo el archivo ZIP"});
    }

    // Paso 2: agrupar productos
    const groupedProducts = {};

    for (const row of rawRows) {
      const productKey = `${row.name}`;
      if (!groupedProducts[productKey]) {
        groupedProducts[productKey] = {
          name: row.name,
          description: row.description,
          price: row.price,
          category_name: row.category,
          variants: [],
        };
      }
      const product = groupedProducts[productKey];
      let variant = product.variants.find((v) => v.color_hex === row.color_hex);

      if (!variant) {
        variant = {
          color_hex: row.color_hex,
          image_folder: row.folder_name,
          images: [],
          stock: [],
        };
        product.variants.push(variant);
      }

      if (!variant.stock.some((s) => s.size_name === row.size)) {
        variant.stock.push({
          size_name: row.size,
          quantity: row.quantity,
        });
      }
    }

    console.log("Grouped products:", groupedProducts);

    // Paso 3: insertar en base de datos
    for (const productData of Object.values(groupedProducts)) {
      let productId;
      const categoryId = await createCategoryIfNotExists(
        productData.category_name
      );

      try {
        const {rows: productRows} = await db.execute(
          "INSERT INTO products (name, description, price, category_id, created_at, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING *",
          [
            productData.name,
            productData.description,
            productData.price,
            categoryId,
          ]
        );

        productId = productRows[0].id;
        console.log(
          `✅ Producto insertado: ${productData.name} (ID: ${productId})`
        );
      } catch (err) {
        console.error("❌ Error al insertar producto:", productData.name, err);
        continue;
      }

      for (const variant of productData.variants) {
        let variantId;

        try {
          const {rows: variantRows} = await db.execute(
            "INSERT INTO product_variants (product_id, color_hex, created_at, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING *",
            [productId, variant.color_hex]
          );

          variantId = variantRows[0].id;
          console.log(
            `✅ Variante insertada: ${variant.color_hex} (ID: ${variantId})`
          );
        } catch (err) {
          console.error(
            "❌ Error al insertar variante:",
            variant.color_hex,
            err
          );
          continue;
        }

        if (imageFoldersMap[variant.image_folder]) {
          const uploadedImages = await Promise.all(
            imageFoldersMap[variant.image_folder].map(async (img) => {
              try {
                // Verificar que la ruta existe
                if (!fs.existsSync(img.filePath)) {
                  console.error("❌ La ruta no existe:", img.filePath);
                  return null;
                }

                console.log("🔼 Subiendo imagen desde:", img.filePath);

                const upload = await cloudinary.uploader.upload(img.filePath, {
                  folder: `productos/${variant.image_folder}`,
                  public_id: path.parse(img.filePath).name,
                });

                console.log("✅ Imagen subida con éxito:", upload.public_id);

                return {
                  url: upload.public_id,
                  order_index: img.orderIndex,
                };
              } catch (err) {
                console.error(
                  "❌ Error subiendo imagen a Cloudinary:",
                  err.message
                );
                return null;
              }
            })
          );

          // Filtrar los nulls si hubo errores
          variant.images = uploadedImages.filter(Boolean);
          console.log("🖼️ Imágenes asociadas a la variante:", variant.images);
        } else {
          console.warn(
            "⚠️ No se encontraron imágenes para la carpeta:",
            variant.image_folder
          );
        }

        for (const image of variant.images) {
          try {
            await db.execute(
              "INSERT INTO images (variant_id, url, order_index) VALUES (?, ?, ?)",
              [variantId, image.url, image.order_index]
            );
            console.log(
              `✅ Imagen insertada para variante ${variantId} (orden: ${image.order_index})`
            );
          } catch (err) {
            console.error(
              "❌ Error al insertar imagen para variante:",
              variantId,
              err
            );
          }
        }

        for (const stock of variant.stock) {
          try {
            const sizeId = await createSizeIfNotExists(
              stock.size_name,
              categoryId
            );

            await db.execute(
              "INSERT INTO stock (variant_id, size_id, quantity) VALUES (?, ?, ?)",
              [variantId, sizeId, stock.quantity]
            );
            console.log(
              `✅ Stock insertado: Variante ${variantId} - Talla ${stock.size_name} (${stock.quantity})`
            );
          } catch (err) {
            console.error(
              `❌ Error al insertar stock para variante ${variantId}, talla ${stock.size_name}:`,
              err
            );
          }
        }
      }
    }

    res.status(200).json({message: "Productos importados correctamente"});
  } catch (error) {
    console.error("❌ Error general al procesar la importación:", error);
    res.status(500).json({error: "Error al importar productos"});
  }
};

exports.importProducts = importProducts;
exports.getFilteredProducts = getFilteredProducts;
exports.getCategoriesProducts = getCategoriesProducts;
exports.getSizesCategory = getSizesCategory;
exports.addProduct = addProduct;
exports.getProducts = getProducts;
exports.updateProduct = updateProduct;
exports.deleteProduct = deleteProduct;
exports.getProductById = getProductById;
