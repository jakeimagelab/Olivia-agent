export type CustomerSelectionValue = {
  selected?: boolean | null;
  rating?: number | null;
  colorLabel?: number | null;
  customer_rating?: number | null;
  customer_color_label?: number | null;
};

export function isCustomerSelection(value: CustomerSelectionValue) {
  const rating = value.rating ?? value.customer_rating;
  const colorLabel = value.colorLabel ?? value.customer_color_label;
  return value.selected === true
    || (Number.isInteger(rating) && Number(rating) >= 1 && Number(rating) <= 5)
    || (Number.isInteger(colorLabel) && Number(colorLabel) >= 6 && Number(colorLabel) <= 9);
}

export function countCustomerSelection(values: Iterable<CustomerSelectionValue>) {
  let count = 0;
  for (const value of values) if (isCustomerSelection(value)) count += 1;
  return count;
}
