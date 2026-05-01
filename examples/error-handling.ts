import { Hostsmith, ApiError, AuthError } from "@hostsmith/sdk";

const client = new Hostsmith({
  accessToken: process.env.HOSTSMITH_TOKEN!,
  partition: "us",
});

try {
  await client.sites.list();
} catch (err) {
  if (err instanceof AuthError) {
    console.error("Invalid or expired token - re-authenticate at https://hostsmith.net/docs/developers/authentication");
  } else if (err instanceof ApiError) {
    console.error(`API error ${err.status}: ${err.message}`);
  } else {
    throw err;
  }
}
