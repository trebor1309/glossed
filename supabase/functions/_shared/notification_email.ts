export type NotificationEmail = {
  notification_id: string;
  recipient_email: string;
  event_type: string;
  title: string;
  body: string;
  metadata: Record<string, unknown> | null;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function notificationPath(metadata: Record<string, unknown> | null) {
  const path = metadata?.path;
  return typeof path === "string" && /^\/(dashboard|prodashboard)(\/|$)/.test(path)
    ? path
    : "/";
}

export function buildNotificationEmail(notification: NotificationEmail, appUrl: string) {
  const baseUrl = appUrl.replace(/\/$/, "");
  const url = `${baseUrl}${notificationPath(notification.metadata)}`;
  const title = notification.title.trim().slice(0, 160);
  const body = notification.body.trim().slice(0, 2000);

  return {
    subject: title,
    text: `${body}\n\nOpen Glossed: ${url}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1f2937">
        <h1 style="font-size:22px;color:#e11d48">${escapeHtml(title)}</h1>
        <p style="line-height:1.6">${escapeHtml(body)}</p>
        <p style="margin-top:24px">
          <a href="${escapeHtml(url)}" style="background:#e11d48;color:#fff;padding:12px 18px;border-radius:999px;text-decoration:none">
            Open Glossed
          </a>
        </p>
        <p style="margin-top:28px;font-size:12px;color:#6b7280">
          You can manage notification preferences from your Glossed settings.
        </p>
      </div>
    `.trim(),
  };
}
