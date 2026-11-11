import { NextResponse } from "next/server";
import { requireServiceToken } from "@/lib/internal-auth";
import { json, route } from "@/lib/http";
import { claimJob } from "@/lib/jobs";

export const POST = route(async (req) => {
  const workerId = requireServiceToken(req);
  const job = await claimJob(workerId);
  if (!job) return new NextResponse(null, { status: 204 });
  return json(job);
});
