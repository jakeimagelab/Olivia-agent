import { Suspense } from "react";
import OliviaBridgeWorkspace from "@/components/olivia-bridge/OliviaBridgeWorkspace";

export default function OliviaBridgePage() {
  return <Suspense fallback={null}><OliviaBridgeWorkspace /></Suspense>;
}
