"use client";

import { useEffect, useMemo, useState } from "react";
import { Camera, Check, ChevronDown, PackageCheck } from "lucide-react";
import { getCameraRoles, getPackingList, getSetupEquipmentCategory, SETUP_CATEGORY_LABEL, type ShootSetupInput } from "@/lib/shootSetup/rules";
import styles from "@/components/conti/v2/ContiV2.module.css";

export default function ContiShootSetupPanels({ input, checked = {}, onToggle }: {
  input: ShootSetupInput;
  checked?: Record<string, boolean>;
  onToggle?: (name: string) => void;
}) {
  const [localChecked, setLocalChecked] = useState(checked);
  useEffect(() => setLocalChecked(checked), [checked]);
  const packing = useMemo(() => getPackingList(input), [input]);
  const roles = useMemo(() => getCameraRoles(input), [input]);
  const grouped = useMemo(() => {
    const rows = new Map<string, typeof packing>();
    for (const item of packing) {
      const category = getSetupEquipmentCategory(item.name);
      rows.set(category, [...(rows.get(category) ?? []), item]);
    }
    return [...rows.entries()];
  }, [packing]);

  function toggle(name: string) {
    setLocalChecked((current) => ({ ...current, [name]: !current[name] }));
    onToggle?.(name);
  }

  return <div className={styles.shootSetupPanels}>
    <details open>
      <summary><span><PackageCheck size={16} />오늘 장비 <small>{packing.filter((item) => localChecked[item.name]).length}/{packing.length}</small></span><ChevronDown size={16} /></summary>
      <div className={styles.packingGroups}>{grouped.map(([category, items]) => <section key={category}><strong>{SETUP_CATEGORY_LABEL[category as keyof typeof SETUP_CATEGORY_LABEL]}</strong><div>{items.map((item) => <label key={item.name}><input type="checkbox" checked={Boolean(localChecked[item.name])} onChange={() => toggle(item.name)} /><span><Check size={12} /></span><em>{item.name}{item.quantity > 1 ? ` × ${item.quantity}` : ""}</em></label>)}</div></section>)}</div>
    </details>
    <details>
      <summary><span><Camera size={16} />카메라 3대</span><ChevronDown size={16} /></summary>
      <div className={styles.cameraRoles}>{roles.map((camera) => <article key={camera.name} data-used={camera.used}><div><strong>{camera.name}</strong><small>파일명 {camera.prefix}</small></div><span>{camera.role}</span></article>)}</div>
    </details>
  </div>;
}
