import { Hostsmith } from "@hostsmith/sdk";

const client = new Hostsmith({
  accessToken: process.env.HOSTSMITH_TOKEN!,
  partition: "us",
});

const { sites } = await client.sites.list();

for (const site of sites) {
  console.log(`${site.subdomain}.${site.domain} (${site.id})`);
}
