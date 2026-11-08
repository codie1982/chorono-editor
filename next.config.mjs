/*
 * Public-site security backlog — 2026-11-06.
 * Scope: https://chorono.com/ redirects to https://www.chorono.com/.
 * Apply public-site changes at its actual origin/hosting configuration; this
 * checkout also serves the local editor and may not control the public site.
 * Report: https://security.huutran.dev/headers-check?url=https%3A%2F%2Fchorono.com
 * No protection is enabled or changed by these TODOs.
 *
 * TODO(security/csp): CSP response header was independently confirmed missing.
 * Inventory required script/style/font/media/worker and connection sources;
 * start with Report-Only, inspect violations, then enforce a suitable policy.
 * Verify video embeds and, wherever the editor is served, MCP connections,
 * rendering and import/export before enforcing restrictions.
 * TODO(security/framing): X-Frame-Options was independently confirmed missing.
 * Configure CSP frame-ancestors and/or X-Frame-Options according to legitimate
 * embedding requirements, then verify the resulting framing protection.
 * TODO(security/mime): X-Content-Type-Options was independently confirmed missing.
 * Add nosniff after checking that served assets have correct Content-Type values.
 * TODO(security/browser-policies): Verify the reported missing Referrer-Policy
 * and Permissions-Policy; choose policies matching the public site's features.
 * TODO(security/email-dns): Independently verify reported missing SPF and DMARC
 * p=none against actual mail usage; review legitimate senders before enforcement.
 * Check DKIM using the mail provider's actual selector: common-selector misses
 * do not establish that DKIM is absent. Changes belong in DNS/provider settings.
 * TODO(security/domain-dns): Verify reported missing CAA and DNSSEC; assess the
 * certificate issuer and registrar/DNS-provider setup before making DNS changes.
 * TODO(security/recheck): Re-run the unavailable certificate-transparency lookup;
 * a failed lookup is not a confirmed site vulnerability. Recheck both hostnames
 * and relevant pages after deployment, preserving the existing HTTPS/HSTS setup.
 */

/** @type {import('next').NextConfig} */
const nextConfig = { experimental: { serverComponentsExternalPackages: ['quickjs-emscripten'] } };

export default nextConfig;
