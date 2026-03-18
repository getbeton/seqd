import { NextResponse } from "next/server";
import { seedDefaults } from "@/lib/db/seed";

export async function POST() {
  try {
    const workspace = await seedDefaults();
    return NextResponse.json({ success: true, workspace });
  } catch (error: any) {
    console.error("Setup error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
