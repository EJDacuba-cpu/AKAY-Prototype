function normalizeText(value = "") {
  return String(value || "").toLowerCase();
}

export function getNotificationCategory(notification = {}) {
  if (["password_reset_request", "account_invite_delivery_failed"].includes(notification.type)) {
    return "system";
  }
  const source = [
    notification.type,
    notification.entityType,
    notification.category,
    notification.title,
    notification.message,
  ]
    .map(normalizeText)
    .join(" ");

  if (
    [
      "follow_up",
      "followup",
      "follow-up",
      "no_show",
      "no show",
      "due_today",
      "due today",
      "rescheduled",
    ].some((keyword) => source.includes(keyword))
  ) {
    return "followups";
  }

  if (
    [
      "referral",
      "incoming_referral",
      "referral_received",
      "referral_completed",
      "referral_no_show",
    ].some((keyword) => source.includes(keyword))
  ) {
    return "referrals";
  }

  if (
    ["medicine", "inventory", "low_stock", "low stock", "expiring", "expired"].some(
      (keyword) => source.includes(keyword),
    )
  ) {
    return "medicine";
  }

  if (
    ["system", "account", "user", "role"].some((keyword) =>
      source.includes(keyword),
    )
  ) {
    return "system";
  }

  return "system";
}

