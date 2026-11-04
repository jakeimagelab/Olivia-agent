export type PersonSelectMatchingImage = {
  id: string;
  owner_person_id: string | null;
  category_key: string;
  original_file_name: string;
  source_rel_path: string;
  thumb_path: string;
  sort_order: number | null;
};

function imageOrder(image: PersonSelectMatchingImage) {
  return Number.isFinite(image.sort_order) ? Number(image.sort_order) : Number.MAX_SAFE_INTEGER;
}

/** 사람마다 업로드 순서가 가장 앞선 사진 한 장을 대표 사진으로 정한다. */
export function firstPersonSelectImageByOwner<T extends PersonSelectMatchingImage>(images: T[]) {
  const result = new Map<string, T>();
  for (const image of images) {
    if (!image.owner_person_id) continue;
    const current = result.get(image.owner_person_id);
    if (!current || imageOrder(image) < imageOrder(current) || (imageOrder(image) === imageOrder(current) && image.id.localeCompare(current.id) < 0)) {
      result.set(image.owner_person_id, image);
    }
  }
  return result;
}

/** 진행 현황에서 고객이 선택하기 전에도 항목별 등록 사진 한 장을 확인한다. */
export function firstPersonSelectImageByCategory<T extends PersonSelectMatchingImage>(images: T[]) {
  const result = new Map<string, T>();
  for (const image of images) {
    if (!image.owner_person_id) continue;
    const key = `${image.owner_person_id}\u0000${image.category_key}`;
    const current = result.get(key);
    if (!current || imageOrder(image) < imageOrder(current) || (imageOrder(image) === imageOrder(current) && image.id.localeCompare(current.id) < 0)) {
      result.set(key, image);
    }
  }
  return result;
}
