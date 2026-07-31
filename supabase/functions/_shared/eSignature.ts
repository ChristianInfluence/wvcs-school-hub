export function requestIp(request: Request) {
  return request.headers.get("cf-connecting-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "";
}

export function typedSignatureRecord({
  name,
  email = "",
  role = "",
  signedAt = new Date().toISOString(),
  agreementText = "I agree that typing my name records my electronic signature.",
  request,
  timeZone = "",
}: {
  name: string;
  email?: string;
  role?: string;
  signedAt?: string;
  agreementText?: string;
  request?: Request;
  timeZone?: string;
}) {
  return {
    name: String(name || "").trim(),
    email: String(email || "").trim().toLowerCase(),
    role,
    signedAt,
    method: "typed electronic signature",
    signatureStyle: "script typed name",
    agreementText,
    userAgent: request?.headers.get("user-agent") || "",
    ipAddress: request ? requestIp(request) : "",
    timeZone,
    signatureId: crypto.randomUUID(),
  };
}
