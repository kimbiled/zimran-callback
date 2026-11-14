// Tests are offline by default, even when eval's parent process loaded a real .env.local.
// Explicit provider tests use mocks and opt in with test-only keys.
for (const name of ["DATABASE_URL", "OPENAI_API_KEY", "AI_GATEWAY_API_KEY", "VERCEL_OIDC_TOKEN", "VERCEL"]) process.env[name] = "";
process.env.AI_DISABLED = "1";
