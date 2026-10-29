# Chehreh Ara Admin Worker

Cloudflare Worker admin panel source.

Before deployment:
- Replace `REPLACE_WITH_KV_NAMESPACE_ID` in `wrangler.jsonc` with the actual ID of the `chehreh-ara-products` KV namespace.
- Configure Worker secrets `ADMIN_PASSWORD` and `SESSION_SECRET` in Cloudflare. Do not commit these secrets to GitHub.
- Ensure the Worker name matches the existing intended Worker.
