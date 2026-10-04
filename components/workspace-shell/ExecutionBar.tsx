import PhotoStudioExecutionBar from "@/components/photo-workspace/PhotoStudioExecutionBar";

export function ExecutionBar({ visible = true }: { visible?: boolean }) {
  return visible ? <PhotoStudioExecutionBar /> : null;
}
