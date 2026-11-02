import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHandler } from "./app.js";
import { chooseProvider } from "./providers.js";
import { readSettings } from "./settings.js";

const { provider, note } = chooseProvider(process.env);
if (note) console.warn(note);

const here = path.dirname(fileURLToPath(import.meta.url));
const { settings, errors, warnings } = readSettings(process.env, Boolean(provider), path.resolve(here, "../../web/dist"));
for (const w of warnings) console.warn(w);
if (errors.length) {
  for (const e of errors) console.error(`Refusing to start: ${e}`);
  process.exit(1);
}

const server = http.createServer(createHandler({ provider, settings, sampleBoard: process.env.SAMPLE_BOARD }));
// Don't let slow or stalled connections hold the server up.
server.headersTimeout = 15_000;
server.requestTimeout = 30_000;
server.keepAliveTimeout = 5_000;

server.listen(settings.port, settings.host, () => {
  const where = `${settings.host}:${settings.port}`;
  console.log(
    `Roadmap server on ${where} (${provider ? provider.name : "sample data"}, ${settings.password ? "password required" : "no password"})`
  );
});

const stop = () => server.close(() => process.exit(0));
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
