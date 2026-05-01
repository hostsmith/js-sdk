import { Hostsmith } from "@hostsmith/sdk";

const client = new Hostsmith({
  accessToken: process.env.HOSTSMITH_TOKEN!,
  partition: "us",
});

const siteId = process.argv[2];

if (!siteId) {
  console.error("Usage: npx tsx examples/deploy-files.ts <site-id>");
  process.exit(1);
}

const result = await client.sites.deploy(siteId, [
  {
    fileName: "index.html",
    content: Buffer.from("<h1>Hello from Hostsmith SDK</h1>"),
  },
  {
    fileName: "style.css",
    content: Buffer.from("body { font-family: sans-serif; }"),
  },
]);

console.log(`Deployed version ${result.versionId} - status: ${result.status}`);
