// For running locally on your own computer only.
// Vercel does NOT use this file — it uses api/index.js directly.
require("dotenv").config();
const app = require("./app");

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Local server running at http://localhost:${PORT}`);
});
