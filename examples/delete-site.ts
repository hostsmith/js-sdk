import { Hostsmith } from "@hostsmith/sdk";

const client = new Hostsmith({
  accessToken: process.env.HOSTSMITH_TOKEN!,
  partition: "us",
});

const siteId = process.argv[2];

if (!siteId) {
  console.error("Usage: npx tsx examples/delete-site.ts <site-id>");
  process.exit(1);
}

const { status } = await client.sites.delete(siteId);

console.log(`Site ${siteId} - ${status}`);
