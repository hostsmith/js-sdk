import { Hostsmith } from "@hostsmith/sdk";

const client = new Hostsmith({
  accessToken: process.env.HOSTSMITH_TOKEN!,
  partition: "us",
});

const siteId = process.argv[2];
const directory = process.argv[3] ?? "./dist";

if (!siteId) {
  console.error(
    "Usage: npx tsx examples/deploy-directory.ts <site-id> [directory]",
  );
  process.exit(1);
}

const result = await client.sites.deploy(siteId, directory);
console.log(`Deployed version ${result.versionId} - status: ${result.status}`);
