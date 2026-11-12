import { randomInt, timingSafeEqual } from "node:crypto";

export function constantTimePinEqual(left: string, right: string) {
  const a = Buffer.from(String(left), "utf8");
  const b = Buffer.from(String(right), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createUniquePin(existing: Iterable<string>) {
  const used = new Set(existing);
  if (used.size >= 10_000) throw new Error("발급할 수 있는 비밀번호가 없습니다.");
  for (let attempt = 0; attempt < 20_000; attempt += 1) {
    const pin = String(randomInt(0, 10_000)).padStart(4, "0");
    if (!used.has(pin)) return pin;
  }
  throw new Error("중복되지 않는 비밀번호를 만들지 못했습니다.");
}
