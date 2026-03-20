const STORAGE_KEY = "pocketclaw-device-identity";

interface StoredIdentity {
  publicKeyJwk: JsonWebKey;
  privateKeyJwk: JsonWebKey;
  deviceId: string;
}

function toBase64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function deriveDeviceId(rawPublicKey: Uint8Array): Promise<string> {
  const hash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", rawPublicKey as unknown as ArrayBuffer),
  );
  return Array.from(hash)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function loadOrCreateIdentity(): Promise<{
  privateKey: CryptoKey;
  deviceId: string;
  publicKeyBase64url: string;
}> {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const data: StoredIdentity = JSON.parse(stored) as StoredIdentity;
      const privateKey = await crypto.subtle.importKey(
        "jwk",
        data.privateKeyJwk,
        "Ed25519",
        false,
        ["sign"],
      );
      const publicKey = await crypto.subtle.importKey("jwk", data.publicKeyJwk, "Ed25519", true, [
        "verify",
      ]);
      const rawPub = new Uint8Array(await crypto.subtle.exportKey("raw", publicKey));
      return {
        privateKey,
        deviceId: data.deviceId,
        publicKeyBase64url: toBase64url(rawPub),
      };
    } catch {
      // Corrupted, regenerate
    }
  }

  const keyPair = (await crypto.subtle.generateKey("Ed25519", true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const rawPub = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey));
  const deviceId = await deriveDeviceId(rawPub);

  const publicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      publicKeyJwk,
      privateKeyJwk,
      deviceId,
    } satisfies StoredIdentity),
  );

  return {
    privateKey: keyPair.privateKey,
    deviceId,
    publicKeyBase64url: toBase64url(rawPub),
  };
}

/**
 * Sign an OpenClaw gateway challenge nonce with Ed25519 device identity.
 * Payload fields must exactly match the connect frame sent by websocket.ts.
 * Verified from gateway-cli source: buildDeviceAuthPayloadV3 in OpenClaw dist.
 */
export async function signChallenge(nonce: string): Promise<{
  deviceId: string;
  publicKey: string;
  signature: string;
  signedAt: number;
}> {
  const { privateKey, deviceId, publicKeyBase64url } = await loadOrCreateIdentity();

  const signedAt = Date.now();
  // normalizeDeviceMetadataForAuth: trim + toLowerAscii
  const platform = (navigator.platform ?? "").trim().toLowerCase();

  // v3 pipe-delimited payload — fields must match connect frame exactly
  const payload = [
    "v3",
    deviceId,
    "openclaw-control-ui", // client.id in connect frame
    "webchat", // client.mode in connect frame
    "operator", // role
    "operator.read,operator.write,operator.admin", // scopes (comma-joined)
    String(signedAt),
    "", // token (empty — auth.mode is "none")
    nonce,
    platform, // client.platform (normalized)
    "desktop", // client.deviceFamily (normalized)
  ].join("|");

  const sigBytes = new Uint8Array(
    await crypto.subtle.sign("Ed25519", privateKey, new TextEncoder().encode(payload)),
  );

  return {
    deviceId,
    publicKey: publicKeyBase64url,
    signature: toBase64url(sigBytes),
    signedAt,
  };
}
