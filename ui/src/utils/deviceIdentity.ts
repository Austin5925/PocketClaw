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

/** Sign an OpenClaw gateway challenge nonce with Ed25519 device identity. */
export async function signChallenge(nonce: string): Promise<{
  deviceId: string;
  publicKey: string;
  signature: string;
  signedAt: number;
}> {
  const { privateKey, deviceId, publicKeyBase64url } = await loadOrCreateIdentity();

  const signedAt = Date.now();
  const platform = navigator.platform.toLowerCase();

  // v3 signing payload (pipe-delimited)
  const payload = [
    "v3",
    deviceId,
    "gateway-client", // clientId
    "backend", // clientMode
    "operator", // role
    "operator.read,operator.write", // scopes
    String(signedAt),
    "", // token (empty for auth mode none)
    nonce,
    platform,
    "desktop", // deviceFamily
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
