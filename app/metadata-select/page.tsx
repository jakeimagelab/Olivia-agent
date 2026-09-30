import MetadataSelectWorkspace from "@/components/metadata-select/MetadataSelectWorkspace";
import { PhotoStudioExecutionProvider } from "@/components/photo-workspace/PhotoStudioExecutionContext";

export default function MetadataSelectPage() {
  return <PhotoStudioExecutionProvider><MetadataSelectWorkspace /></PhotoStudioExecutionProvider>;
}
