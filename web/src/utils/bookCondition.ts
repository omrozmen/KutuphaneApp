export type ConditionCounts = {
  healthy: number;
  damaged: number;
  lost: number;
};

const clamp = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
};

export const normalizeConditionCounts = (totalQuantity: number, counts: ConditionCounts): ConditionCounts => {
  const total = Math.max(0, Math.floor(totalQuantity) || 0);
  let healthy = clamp(counts.healthy);
  let damaged = clamp(counts.damaged);
  let lost = clamp(counts.lost);

  if (damaged > total) damaged = total;
  if (lost > total - damaged) lost = total - damaged;
  if (healthy > total - damaged - lost) healthy = total - damaged - lost;

  let sum = healthy + damaged + lost;

  if (sum < total) {
    healthy += total - sum;
  } else if (sum > total) {
    let diff = sum - total;
    const reduceHealthy = Math.min(diff, healthy);
    healthy -= reduceHealthy;
    diff -= reduceHealthy;

    if (diff > 0) {
      const reduceDamaged = Math.min(diff, damaged);
      damaged -= reduceDamaged;
      diff -= reduceDamaged;
    }

    if (diff > 0) {
      const reduceLost = Math.min(diff, lost);
      lost -= reduceLost;
      diff -= reduceLost;
    }
  }

  return {
    healthy: Math.max(0, healthy),
    damaged: Math.max(0, damaged),
    lost: Math.max(0, lost),
  };
};

export const tryAdjustConditionCounts = (
  totalQuantity: number,
  counts: ConditionCounts,
  type: "healthy" | "damaged" | "lost",
  delta: 1 | -1
): { changed: boolean; counts: ConditionCounts } => {

  const next = { ...counts };
  let changed = false;
  const total = Math.max(0, Math.floor(totalQuantity) || 0);

  const currentTotal = counts.healthy + counts.damaged + counts.lost;

  if (type === "healthy") {
    if (delta > 0) {
      if (currentTotal >= total) {
        if (next.damaged > 0) {
          next.damaged -= 1;
          next.healthy += 1;
          changed = true;
        } else if (next.lost > 0) {
          next.lost -= 1;
          next.healthy += 1;
          changed = true;
        }
      } else {
        next.healthy += 1;
        changed = true;
      }
    } else {
      if (next.healthy <= 0) {
        return { changed: false, counts };
      }
      next.healthy -= 1;
      next.damaged += 1;
      changed = true;
    }
  } else if (type === "damaged") {
    if (delta > 0) {
      if (next.healthy <= 0) {
        return { changed: false, counts };
      }
      next.healthy -= 1;
      next.damaged += 1;
      changed = true;
    } else {
      if (next.damaged <= 0) {
        return { changed: false, counts };
      }
      next.damaged -= 1;
      next.healthy += 1;
      changed = true;
    }
  } else {
    if (delta > 0) {
      if (next.healthy <= 0) {
        return { changed: false, counts };
      }
      next.healthy -= 1;
      next.lost += 1;
      changed = true;
    } else {
      if (next.lost <= 0) {
        return { changed: false, counts };
      }
      next.lost -= 1;
      next.healthy += 1;
      changed = true;
    }
  }

  if (!changed) {
    return { changed: false, counts };
  }

  return {
    changed: true,
    counts: normalizeConditionCounts(total, next),
  };
};
