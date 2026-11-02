export function resourceCostTotal(costs) {
  if (!costs || typeof costs !== 'object') return null;
  if (costs.total != null) {
    const declaredTotal = Number(costs.total);
    if (Number.isFinite(declaredTotal) && declaredTotal >= 0) return declaredTotal;
  }
  const values = [
    costs.food,
    costs.wood,
    costs.gold,
    costs.stone,
    costs.vizier,
    costs.oliveOil ?? costs.oliveoil,
    costs.silver,
  ];
  let hasResourceCost = false;
  let total = 0;
  for (const value of values) {
    if (value == null || !Number.isFinite(Number(value))) continue;
    hasResourceCost = true;
    total += Number(value);
  }
  return hasResourceCost ? total : null;
}
