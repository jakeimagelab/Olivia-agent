export type CustomerRating = 1 | 2 | 3 | 4 | 5;
export type CustomerColorLabel = 6 | 7 | 8 | 9;

export type CustomerSelectionValue = {
  selected?: boolean | null;
  rating?: number | null;
  colorLabel?: number | null;
  customer_rating?: number | null;
  customer_color_label?: number | null;
};

export function isCustomerRating(value: unknown): value is CustomerRating {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 5;
}

export function isCustomerColorLabel(value: unknown): value is CustomerColorLabel {
  return Number.isInteger(value) && Number(value) >= 6 && Number(value) <= 9;
}

export function normalizeCustomerRating(value: unknown): CustomerRating | null {
  return isCustomerRating(value) ? value : null;
}

export function normalizeCustomerColorLabel(value: unknown): CustomerColorLabel | null {
  return isCustomerColorLabel(value) ? value : null;
}

export function isCustomerSelection(value: CustomerSelectionValue) {
  const rating = value.rating ?? value.customer_rating;
  const colorLabel = value.colorLabel ?? value.customer_color_label;
  return value.selected === true
    || isCustomerRating(rating)
    || isCustomerColorLabel(colorLabel);
}

export function countCustomerSelection(values: Iterable<CustomerSelectionValue>) {
  let count = 0;
  for (const value of values) if (isCustomerSelection(value)) count += 1;
  return count;
}

export function customerSelectionIds(input: {
  selectedImageIds?: Iterable<string>;
  ratings?: Readonly<Record<string, unknown>>;
  colorLabels?: Readonly<Record<string, unknown>>;
}) {
  const selected = new Set(input.selectedImageIds ?? []);
  for (const [imageId, rating] of Object.entries(input.ratings ?? {})) {
    if (isCustomerRating(rating)) selected.add(imageId);
  }
  for (const [imageId, colorLabel] of Object.entries(input.colorLabels ?? {})) {
    if (isCustomerColorLabel(colorLabel)) selected.add(imageId);
  }
  return selected;
}
