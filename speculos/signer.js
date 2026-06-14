const express = require("express");
const cors = require("cors");
const SpeculosTransport = require("@ledgerhq/hw-transport-node-speculos-http").default;
const Eth = require("@ledgerhq/hw-app-eth").default;
const SPECULOS_HOST = "http://localhost";
const SPECULOS_PORT = 5100;
const DERIVATION_PATH = "44'/60'/0'/0/1";


const app = express();
app.use(cors());
app.use(express.json());

async function openTransport() {
  // Package constructs URL as `${baseURL}:${apiPort}` — must be separate
  return SpeculosTransport.open({ baseURL: SPECULOS_HOST, apiPort: SPECULOS_PORT });
}

// GET /address — returns the Speculos wallet address (use this as policy owner)
app.get("/address", async (req, res) => {
  try {
    const transport = await openTransport();
    const eth = new Eth(transport);
    const result = await eth.getAddress(DERIVATION_PATH);
    await transport.close();
    console.log("Speculos address:", result.address);
    res.json({ address: result.address });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /sign — signs a bytes32 digest with personal_sign
// Body: { digest: "0x..." }
// Returns: { signature: "0x..." }
app.post("/sign", async (req, res) => {
  const { digest } = req.body;
  if (!digest) return res.status(400).json({ error: "digest required" });

  console.log("\n→ Signing request received");
  console.log("  digest:", digest);
  console.log(`  Waiting for approval on Speculos screen at ${SPECULOS_HOST}:${SPECULOS_PORT} ...\n`);

  try {
    const transport = await openTransport();
    const eth = new Eth(transport);

    // signPersonalMessage sends the APDU — device shows "Sign Message" screen
    // User must approve in the Speculos web UI at http://localhost:5000
    const sig = await eth.signPersonalMessage(
      DERIVATION_PATH,
      digest.replace("0x", "")
    );

    await transport.close();

    // v is 27 or 28 from hw-app-eth
    const signature =
      "0x" + sig.r + sig.s + sig.v.toString(16).padStart(2, "0");

    console.log("✓ Signed:", signature);
    res.json({ signature });
  } catch (e) {
    console.error("✗ Signing failed:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// Health check
app.get("/health", (_, res) => res.json({ status: "ok", speculos: `${SPECULOS_HOST}:${SPECULOS_PORT}` }));

const PORT = 3099;
app.listen(PORT, () => {
  console.log(`\nSpeculos signing proxy running on http://localhost:${PORT}`);
  console.log(`Make sure Speculos is running at ${SPECULOS_HOST}:${SPECULOS_PORT}`);
  console.log(`Get your Speculos wallet address: GET http://localhost:${PORT}/address\n`);
});

module.exports = { getAddress: async () => {
  const transport = await openTransport();
  const eth = new Eth(transport);
  const { address } = await eth.getAddress(DERIVATION_PATH);
  await transport.close();
  return address;
}};
