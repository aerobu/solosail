import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    tavily: !!process.env.TAVILY_API_KEY,
    uptime: process.uptime(),
  });
}
