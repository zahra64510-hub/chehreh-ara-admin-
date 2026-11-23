
import admin from "./chehreh-ara-admin-worker.js";

function fixImageLinks(data, origin) {
  if (!data || !Array.isArray(data.products)) return data;

  data.products = data.products.map(product => {
    if (typeof product.image === "string") {
      try {
        const imageUrl = new URL(product.image);
        if (
          imageUrl.hostname === "frosty-scene-26cb.ca83.workers.dev" &&
          imageUrl.pathname.startsWith("/images/")
        ) {
          product = {
            ...product,
            image: new URL(imageUrl.pathname, origin).toString()
          };
        }
      } catch {}
    }
    return product;
  });

  return data;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // نمایش فروشگاه در صفحه اصلی
    if (path === "/" || (!path.startsWith("/api/") &&
        path !== "/admin" && !path.startsWith("/images/"))) {
      return env.ASSETS.fetch(request);
    }

    // اتصال پنل مدیریت و API به همین دامنه
    const response = await admin.fetch(request, env, ctx);

    // اصلاح آدرس عکس‌های قدیمی برای دامنه جدید
    if (
      request.method === "GET" &&
      (path === "/api/public-products" || path === "/api/products") &&
      response.ok
    ) {
      try {
        const data = fixImageLinks(await response.json(), url.origin);
        return new Response(JSON.stringify(data), {
          status: response.status,
          headers: response.headers
        });
      } catch {}
    }

    return response;
  }
};
