import dotenv from "dotenv";
import FormData from "form-data";
import Mailgun from "mailgun.js";

dotenv.config({ path: ".env.local" });

function requireEnv(key) {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key} — add it to .env.local`);
  return value;
}

async function sendSimpleMessage() {
  const apiKey = requireEnv("MAILGUN_API_KEY");
  const domain = requireEnv("MAILGUN_DOMAIN");
  const baseUrl = process.env.MAILGUN_BASE_URL;
  const recipient = requireEnv("RECIPIENT_EMAIL");

  const mailgun = new Mailgun(FormData);
  const mg = mailgun.client({ username: "api", key: apiKey, url: baseUrl });

  try {
    const data = await mg.messages.create(domain, {
      from: `Job Search Agent <mailgun@${domain}>`,
      to: [recipient],
      subject: "Mailgun test",
      text: "This is a manual Mailgun connectivity test.",
    });

    console.log(data);
  } catch (error) {
    console.log(error);
  }
}

sendSimpleMessage();
