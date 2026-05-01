import { Hostsmith } from "@hostsmith/sdk";

const client = new Hostsmith({
  accessToken: process.env.HOSTSMITH_TOKEN!,
  partition: "us",
});

// List all domains (shared + custom)
const { domains } = await client.domains.list();

for (const domain of domains) {
  const type = domain.shared ? "shared" : "custom";
  const supports = [
    domain.enableSubdomains ? "subdomains" : null,
    domain.enableApexDomain ? "apex" : null,
  ].filter(Boolean).join(", ");
  console.log(`${domain.name} [${type}] (${domain.partition}) - ${supports} - ${domain.status}`);
  console.log(`  served at: ${domain.canonicalServedUrl}${domain.bareApexCovered ? "" : "  (bare apex not reachable)"}`);
}

// List only shared domains
const { domains: shared } = await client.domains.list({ shared: true });
console.log(`\nShared domains: ${shared.map((d) => d.name).join(", ")}`);

// List only custom domains
const { domains: custom } = await client.domains.list({ shared: false });
console.log(`Custom domains: ${custom.map((d) => d.name).join(", ")}`);
