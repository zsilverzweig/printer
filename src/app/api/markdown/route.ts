import { NextRequest, NextResponse } from "next/server";

import { getMarkdownFiles } from "@/lib/services/markdown";

export async function GET(request: NextRequest) {
  try {
    const files = await getMarkdownFiles();
    return NextResponse.json(files);
  } catch (error) {
    console.error("Error fetching markdown files:", error);
    return NextResponse.json(
      { error: "Failed to fetch markdown files" },
      { status: 500 }
    );
  }
}
