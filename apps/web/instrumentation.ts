export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./src/instrumentation-server");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./src/instrumentation-edge");
  }
}
