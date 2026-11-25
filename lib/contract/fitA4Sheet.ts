export function fitA4Sheet(node: Element) {
  const element = node as HTMLElement;
  const pageHeight = 1120;
  if (element.getBoundingClientRect().height <= pageHeight) return;

  element.dataset.fit = "compact";
  const { height, width } = element.getBoundingClientRect();
  if (height <= pageHeight) return;

  // Keep the scaled sheet in one print box, including its footer.
  const scale = (pageHeight - 4) / height;
  const frame = element.ownerDocument.createElement("div");
  Object.assign(frame.style, {
    width: `${width}px`,
    height: `${pageHeight}px`,
    position: "relative",
    overflow: "hidden",
  });
  element.replaceWith(frame);
  frame.append(element);
  Object.assign(element.style, {
    position: "absolute",
    top: "0",
    left: `${(width - width * scale) / 2}px`,
    transformOrigin: "top left",
    transform: `scale(${scale})`,
  });
}
