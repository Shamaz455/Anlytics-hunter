// Vercel calls this file as a serverless function for every request
// under /api/*. It just hands the request to our existing Express app —
// no app.listen() needed here, Vercel manages that.
const app = require("../app");
module.exports = app;
