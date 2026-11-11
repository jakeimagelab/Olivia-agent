import { DOMParser, XMLSerializer, type Document, type Element } from "@xmldom/xmldom";

const RDF_NS = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const XMP_NS = "http://ns.adobe.com/xap/1.0/";
const OLIVIA_NS = "https://olivia.photoclinic.kr/ns/raw-select/1.0/";
const XMLNS_NS = "http://www.w3.org/2000/xmlns/";
const ABSENT_VALUE = "__absent__";

export type RawMarkXmpValues = {
  rating: number | null;
  label: string | null;
  colorCode?: 6 | 7 | 8 | 9 | null;
  jobId: string;
};

export type RawMarkXmpUpdate = {
  xml: string;
  createdDocument: boolean;
  previousRating: string | null;
  previousLabel: string | null;
};

function parseXml(xml: string) {
  const errors: string[] = [];
  const document = new DOMParser({
    onError: (level, message) => {
      if (level !== "warning") errors.push(String(message));
    },
  }).parseFromString(xml, "application/xml");
  if (!document?.documentElement || errors.length || document.getElementsByTagName("parsererror").length) {
    throw new Error(`기존 XMP XML을 읽지 못했습니다${errors[0] ? `: ${errors[0]}` : ""}`);
  }
  return document;
}
function createDocument() {
  return parseXml(
    '<?xml version="1.0" encoding="UTF-8"?>\n'
      + '<x:xmpmeta xmlns:x="adobe:ns:meta/">'
      + `<rdf:RDF xmlns:rdf="${RDF_NS}">`
      + '<rdf:Description rdf:about="" />'
      + "</rdf:RDF></x:xmpmeta>",
  );
}
function descriptionOf(document: Document) {
  const existing = document.getElementsByTagNameNS(RDF_NS, "Description").item(0)
    ?? document.getElementsByTagName("rdf:Description").item(0);
  if (existing) return existing;
  const rdf = document.getElementsByTagNameNS(RDF_NS, "RDF").item(0)
    ?? document.getElementsByTagName("rdf:RDF").item(0);
  if (!rdf) throw new Error("XMP 안에서 rdf:RDF를 찾지 못했습니다.");
  const description = document.createElementNS(RDF_NS, "rdf:Description");
  description.setAttributeNS(RDF_NS, "rdf:about", "");
  rdf.appendChild(description);
  return description;
}

function namespacedValue(description: Element, namespace: string, qualifiedName: string, localName: string) {
  const attribute = description.getAttributeNS(namespace, localName);
  if (attribute !== null) return attribute;
  const legacyAttribute = description.getAttribute(qualifiedName);
  if (legacyAttribute !== null) return legacyAttribute;
  const child = description.getElementsByTagNameNS(namespace, localName).item(0)
    ?? description.getElementsByTagName(qualifiedName).item(0);
  return child?.textContent ?? null;
}

function removeValueChildren(description: Element, namespace: string, qualifiedName: string, localName: string) {
  const children = [
    ...Array.from(description.getElementsByTagNameNS(namespace, localName)),
    ...Array.from(description.getElementsByTagName(qualifiedName)),
  ];
  for (const child of new Set(children)) child.parentNode?.removeChild(child);
}

function setNamespacedValue(
  description: Element,
  namespace: string,
  qualifiedName: string,
  localName: string,
  value: string | null,
) {
  removeValueChildren(description, namespace, qualifiedName, localName);
  description.removeAttribute(qualifiedName);
  description.removeAttributeNS(namespace, localName);
  if (value !== null) description.setAttributeNS(namespace, qualifiedName, value);
}

function ensureNamespace(description: Element, prefix: string, namespace: string) {
  const attributeName = `xmlns:${prefix}`;
  if (!description.lookupNamespaceURI(prefix)) description.setAttributeNS(XMLNS_NS, attributeName, namespace);
}

export function updateRawMarkXmp(existingXml: string | null, values: RawMarkXmpValues): RawMarkXmpUpdate {
  const createdDocument = !existingXml?.trim();
  const document = createdDocument ? createDocument() : parseXml(existingXml!);
  const description = descriptionOf(document);
  ensureNamespace(description, "xmp", XMP_NS);
  ensureNamespace(description, "olivia", OLIVIA_NS);

  const previousRating = namespacedValue(description, XMP_NS, "xmp:Rating", "Rating");
  const previousLabel = namespacedValue(description, XMP_NS, "xmp:Label", "Label");
  const previousColorCode = namespacedValue(description, OLIVIA_NS, "olivia:ColorCode", "ColorCode");
  const backupJob = namespacedValue(description, OLIVIA_NS, "olivia:RawSelectJobId", "RawSelectJobId");
  if (backupJob !== values.jobId) {
    setNamespacedValue(description, OLIVIA_NS, "olivia:PrevRating", "PrevRating", previousRating ?? ABSENT_VALUE);
    setNamespacedValue(description, OLIVIA_NS, "olivia:PrevLabel", "PrevLabel", previousLabel ?? ABSENT_VALUE);
    setNamespacedValue(description, OLIVIA_NS, "olivia:PrevColorCode", "PrevColorCode", previousColorCode ?? ABSENT_VALUE);
  }
  setNamespacedValue(description, OLIVIA_NS, "olivia:RawSelectJobId", "RawSelectJobId", values.jobId);
  setNamespacedValue(description, OLIVIA_NS, "olivia:CreatedSidecar", "CreatedSidecar", createdDocument ? "true" : "false");
  setNamespacedValue(description, XMP_NS, "xmp:Rating", "Rating", values.rating === null ? null : String(values.rating));
  setNamespacedValue(description, XMP_NS, "xmp:Label", "Label", values.label);
  setNamespacedValue(description, OLIVIA_NS, "olivia:ColorCode", "ColorCode", values.colorCode === null || values.colorCode === undefined ? null : String(values.colorCode));

  return {
    xml: new XMLSerializer().serializeToString(document),
    createdDocument,
    previousRating,
    previousLabel,
  };
}

export function restoreRawMarkXmp(existingXml: string, jobId: string): { deleteSidecar: boolean; xml: string } {
  const document = parseXml(existingXml);
  const description = descriptionOf(document);
  const storedJobId = namespacedValue(description, OLIVIA_NS, "olivia:RawSelectJobId", "RawSelectJobId");
  if (storedJobId !== jobId) throw new Error("이 XMP는 선택한 로우 셀렉 작업 이후 다른 작업에서 변경되었습니다.");
  const createdSidecar = namespacedValue(description, OLIVIA_NS, "olivia:CreatedSidecar", "CreatedSidecar") === "true";
  const previousRating = namespacedValue(description, OLIVIA_NS, "olivia:PrevRating", "PrevRating");
  const previousLabel = namespacedValue(description, OLIVIA_NS, "olivia:PrevLabel", "PrevLabel");
  const previousColorCode = namespacedValue(description, OLIVIA_NS, "olivia:PrevColorCode", "PrevColorCode");
  if (createdSidecar && previousRating === ABSENT_VALUE && previousLabel === ABSENT_VALUE) {
    return { deleteSidecar: true, xml: "" };
  }
  setNamespacedValue(description, XMP_NS, "xmp:Rating", "Rating", previousRating === ABSENT_VALUE ? null : previousRating);
  setNamespacedValue(description, XMP_NS, "xmp:Label", "Label", previousLabel === ABSENT_VALUE ? null : previousLabel);
  setNamespacedValue(description, OLIVIA_NS, "olivia:ColorCode", "ColorCode", previousColorCode === ABSENT_VALUE ? null : previousColorCode);
  setNamespacedValue(description, OLIVIA_NS, "olivia:PrevRating", "PrevRating", null);
  setNamespacedValue(description, OLIVIA_NS, "olivia:PrevLabel", "PrevLabel", null);
  setNamespacedValue(description, OLIVIA_NS, "olivia:PrevColorCode", "PrevColorCode", null);
  setNamespacedValue(description, OLIVIA_NS, "olivia:RawSelectJobId", "RawSelectJobId", null);
  setNamespacedValue(description, OLIVIA_NS, "olivia:CreatedSidecar", "CreatedSidecar", null);
  return { deleteSidecar: false, xml: new XMLSerializer().serializeToString(document) };
}
