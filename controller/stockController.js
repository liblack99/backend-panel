const db = require("../config/db");

const getSizeId = async (sizeName, categoryId) => {
  try {
    const result = await db.execute(
      "SELECT id FROM sizes WHERE name = ? AND category_id = ?",
      [sizeName, categoryId]
    );
    const id = result.rows?.[0]?.id || null;
    console.log(
      "✅ Size ID found:",
      id,
      "for",
      sizeName,
      "in category:",
      categoryId
    );
    return id;
  } catch (err) {
    console.error("❌ Error getting size ID:", err);
    throw new Error("Error in getSizeId: " + err.message);
  }
};

const createSizeIfNotExists = async (sizeName, categoryId) => {
  try {
    let sizeId = await getSizeId(sizeName, categoryId);

    if (!sizeId) {
      console.log(
        "ℹ️ Size doesn't exist, creating:",
        sizeName,
        "in category:",
        categoryId
      );

      const result = await db.execute(
        "INSERT INTO sizes (name, category_id) VALUES (?, ?)",
        [sizeName, categoryId]
      );

      // Turso: devuelve un objeto con `lastInsertRowid`
      const newSizeId = result.lastInsertRowid;
      console.log("✅ Size created with ID:", newSizeId);
      return newSizeId;
    }

    return sizeId;
  } catch (err) {
    console.error("❌ Error in createSizeIfNotExists:", err);
    throw new Error("Error in createSizeIfNotExists: " + err.message);
  }
};

module.exports = {createSizeIfNotExists};
