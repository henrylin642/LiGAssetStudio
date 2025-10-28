import { NextRequest, NextResponse } from "next/server";

const LIG_BASE_URL = process.env.LIG_BASE_URL ?? "https://lab.lig.com.tw";

type UpstreamLoginResponse = {
  token?: string;
  jwt?: string;
  access_token?: string;
  user?: {
    id?: string;
    name?: string;
    email?: string;
  };
  [key: string]: unknown;
};

function extractToken(json: UpstreamLoginResponse | undefined, headers: Headers) {
  const tokenFromBody = json?.token ?? json?.jwt ?? json?.access_token;
  if (typeof tokenFromBody === "string" && tokenFromBody.length > 0) {
    return tokenFromBody;
  }

  const headerKeys = ["authorization", "x-authorization", "set-authorization"];
  for (const key of headerKeys) {
    const headerValue = headers.get(key);
    if (!headerValue) continue;
    const bearerMatch = headerValue.match(/Bearer\s+(.*)/i);
    if (bearerMatch?.[1]) {
      return bearerMatch[1].trim();
    }
    if (headerValue.trim().length > 0) {
      return headerValue.trim();
    }
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const upstreamResponse = await fetch(`${LIG_BASE_URL}/api/v1/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const rawBody = await upstreamResponse.text();
    let json: UpstreamLoginResponse | undefined;
    try {
      json = rawBody ? (JSON.parse(rawBody) as UpstreamLoginResponse) : undefined;
    } catch (error) {
      console.warn("Failed to parse upstream login response", error);
    }

    if (!upstreamResponse.ok) {
      return NextResponse.json(json ?? { error: "Login failed" }, { status: upstreamResponse.status });
    }

    const token = extractToken(json, upstreamResponse.headers);

    if (!token) {
      return NextResponse.json({ error: "Token was not provided by upstream" }, { status: 502 });
    }

    return NextResponse.json({ token, user: json?.user });
  } catch (error) {
    console.error("/api/auth/login error", error);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
