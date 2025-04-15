const xl = require("excel4node");
const fs = require("fs");
const path = require("path");

const generateTemplateFile = async (req, res) => {
  try {
    const tempDir = path.join(__dirname, "../temp");

    // Asegura que la carpeta exista
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, {recursive: true});
    }

    const filePath = path.join(tempDir, "plantilla_productos.xlsx");

    const wb = new xl.Workbook();
    const ws = wb.addWorksheet("Productos");

    const headers = [
      "name",
      "description",
      "category",
      "price",
      "color_hex",
      "size",
      "quantity",
      "folder_name",
    ];

    const exampleRow = [
      "Camiseta Basica",
      "Algodón premium",
      "Camisetas",
      59000,
      "#0000FF",
      "S",
      10,
      "camiseta_basica_#0000FF",
    ];

    // Escribe encabezados
    headers.forEach((header, i) => {
      ws.cell(1, i + 1).string(header);
    });

    // Escribe datos de ejemplo
    exampleRow.forEach((value, i) => {
      const col = i + 1;
      if (typeof value === "number") {
        ws.cell(2, col).number(value);
      } else {
        ws.cell(2, col).string(value);
      }
    });

    // Guarda el archivo y espera a que se escriba
    wb.write(filePath, async function (err, stats) {
      if (err) {
        console.error("❌ Error escribiendo el archivo:", err);
        return res.status(500).send("Error al generar la plantilla");
      }

      // Verifica si el archivo existe realmente antes de enviar
      if (fs.existsSync(filePath)) {
        return res.download(filePath, "plantilla_productos.xlsx", (err) => {
          if (err) {
            console.error("❌ Error al enviar el archivo:", err);
            return res.status(500).send("Error al descargar el archivo");
          }

          // Elimina el archivo después de enviarlo
          fs.unlinkSync(filePath);
        });
      } else {
        return res
          .status(500)
          .send("Archivo no encontrado después de generarlo");
      }
    });
  } catch (err) {
    console.error("❌ Error inesperado:", err);
    res.status(500).send("Error interno del servidor");
  }
};

module.exports = generateTemplateFile;
