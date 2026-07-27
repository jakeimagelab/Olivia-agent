const AVATAR_COLORS = ["#e85d2c", "#155855", "#2f5fd6", "#7c3aed", "#c9581a", "#15805f", "#c0388a"];

export function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function avatarInitial(name: string) {
  return name?.slice(0, 1) || "?";
}
