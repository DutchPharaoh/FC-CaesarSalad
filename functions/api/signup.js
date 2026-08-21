import { json } from "./_shared.js";

const TO_EMAIL = "k.saad@garansys.nl";
// "onboarding@resend.dev" is Resend's ingebouwde testafzender: die werkt
// zonder eigen domein te verifiëren, maar levert alleen af op het
// e-mailadres waarmee het Resend-account zelf is aangemaakt. Zorg dus dat
// het Resend-account is aangemaakt met TO_EMAIL hierboven.
const FROM_EMAIL = "FC Caesar Salad <onboarding@resend.dev>";

export async function onRequestPost({ request, env }) {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    return json(500, { error: "E-mail versturen is niet geconfigureerd (RESEND_API_KEY ontbreekt)" });
  }

  const body = await request.json();
  const name = (body.name || "").trim();
  const unit = (body.unit || "").trim();
  if (!name || !unit) {
    return json(400, { error: "Naam en unit zijn verplicht" });
  }
  if (name.length > 200 || unit.length > 200) {
    return json(400, { error: "Naam of unit is te lang" });
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [TO_EMAIL],
      subject: "Nieuwe aanmelding FC Caesar Salad",
      text: `Naam: ${name}\nUnit: ${unit}`,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    return json(502, { error: `Versturen van e-mail is mislukt: ${errText}` });
  }

  return json(200, { sent: true });
}
