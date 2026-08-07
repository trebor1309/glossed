const blockedRemoteHosts = ["supabase.co", "stripe.com"];

function isBlockedRemoteHost(hostname) {
  return blockedRemoteHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
}

export async function isolateFromRemoteServices(page) {
  page.on("pageerror", (error) => {
    console.error(`[browser page error] ${error.stack || error.message}`);
  });

  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (
      isBlockedRemoteHost(url.hostname) ||
      (url.hostname === "127.0.0.1" && url.port === "54321")
    ) {
      await route.abort("blockedbyclient");
      return;
    }

    if (request.resourceType() === "image" && url.hostname !== "127.0.0.1") {
      await route.abort("blockedbyclient");
      return;
    }

    await route.continue();
  });
}
