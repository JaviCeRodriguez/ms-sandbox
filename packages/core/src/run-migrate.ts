import { migrate } from "./migrate.js";

await migrate();
console.log("migrate ok");
process.exit(0);
