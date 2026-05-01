import { Hostsmith } from "@hostsmith/sdk";

const client = new Hostsmith({
  accessToken: process.env.HOSTSMITH_TOKEN!,
  partition: "us",
});

const { siteId } = await client.sites.create({
  subdomain: "my-app",
  domain: "us.hostsmith.link",
});

console.log(`Created site: ${siteId}`);
