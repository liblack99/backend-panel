const {createClient} = require("@libsql/client");
require("dotenv").config(); // Cargar variables de entorno desde el archivo .env

const db = createClient({
  url: process.env.TURSO_DB_URL, // URL de tu base de datos en Turso
  authToken: process.env.TURSO_DB_TOKEN, // Token de autenticación
});

db.execute("SELECT 1")
  .then(() => {
    console.log("Conexión exitosa a la base de datos Turso");
  })
  .catch((err) => {
    console.error("Error conectando a la base de datos Turso:", err.message);
    process.exit(1);
  });

module.exports = db;
