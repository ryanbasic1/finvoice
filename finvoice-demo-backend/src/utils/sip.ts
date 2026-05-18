
export function requiredSip(target: number, annualRatePct: number, months: number) {
  const r = (annualRatePct / 100) / 12;
  if (r <= 0) return target / months;
  const denom = Math.pow(1 + r, months) - 1;
  return (target * r) / denom;
}

export function sipFutureValue(amount: number, annualRatePct: number, months: number) {
  const r = (annualRatePct / 100) / 12;
  if (r <= 0) return amount * months;
  return amount * (Math.pow(1 + r, months) - 1) / r;
}
