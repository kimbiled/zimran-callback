import type { Metadata } from "next";
import { DebriefView } from "@/components/DebriefView";
import { sampleCall } from "@/lib/sample";

export const metadata: Metadata = { title: "Sample debrief · Callback" };

export default function SamplePage() {
  const call = sampleCall();
  return <DebriefView call={call} debrief={call.debrief!} />;
}
