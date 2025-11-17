type QuotaRecord = {
  userId: string;
  dailyLimit: number;
  monthlyLimit: number;
  dailyUsed: number;
  monthlyUsed: number;
  dailyResetAt: number;
  monthlyResetAt: number;
};

const DEFAULT_QUOTA = {
  dailyLimit: 10,
  monthlyLimit: 120,
};

const quotaStore = new Map<string, QuotaRecord>();

function startOfDay(date: Date) {
  const clone = new Date(date);
  clone.setHours(0, 0, 0, 0);
  return clone;
}

function startOfMonth(date: Date) {
  const clone = new Date(date);
  clone.setDate(1);
  clone.setHours(0, 0, 0, 0);
  return clone;
}

function getResetTimestamp(date: Date, isMonthly: boolean) {
  return (isMonthly ? startOfMonth(date) : startOfDay(date)).getTime();
}

function ensureQuota(userId: string) {
  const now = new Date();
  const dailyResetAt = getResetTimestamp(now, false);
  const monthlyResetAt = getResetTimestamp(now, true);

  const record = quotaStore.get(userId);
  if (!record) {
    const created: QuotaRecord = {
      userId,
      dailyLimit: DEFAULT_QUOTA.dailyLimit,
      monthlyLimit: DEFAULT_QUOTA.monthlyLimit,
      dailyUsed: 0,
      monthlyUsed: 0,
      dailyResetAt,
      monthlyResetAt,
    };
    quotaStore.set(userId, created);
    return created;
  }

  if (record.dailyResetAt !== dailyResetAt) {
    record.dailyUsed = 0;
    record.dailyResetAt = dailyResetAt;
  }
  if (record.monthlyResetAt !== monthlyResetAt) {
    record.monthlyUsed = 0;
    record.monthlyResetAt = monthlyResetAt;
  }
  return record;
}

export function getQuota(userId: string) {
  const record = ensureQuota(userId);
  return {
    userId,
    dailyLimit: record.dailyLimit,
    dailyUsed: record.dailyUsed,
    monthlyLimit: record.monthlyLimit,
    monthlyUsed: record.monthlyUsed,
  };
}

export function tryConsumeQuota(userId: string, amount: number) {
  const record = ensureQuota(userId);
  if (record.dailyUsed + amount > record.dailyLimit) {
    return { ok: false, reason: "daily" as const };
  }
  if (record.monthlyUsed + amount > record.monthlyLimit) {
    return { ok: false, reason: "monthly" as const };
  }
  record.dailyUsed += amount;
  record.monthlyUsed += amount;
  return { ok: true };
}
