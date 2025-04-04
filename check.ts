import "dotenv";

console.log(Deno.env.get('OPENAI_API_KEY'));
console.log(Deno.env.get('EMAIL_USER_TRACKER'));
console.log(Deno.env.get('EMAIL_PASS_TRACKER'));
console.log(Deno.env.get('EMAIL_USER_NOTIFIER'));
console.log(Deno.env.get('EMAIL_PASS_NOTIFIER'));
console.log(Deno.env.get('IMAP_HOST'));
console.log(Deno.env.get('IMAP_PORT'));
console.log(Deno.env.get('SMTP_HOST'));
console.log(Deno.env.get('SMTP_PORT'));
console.log(Deno.env.get('EMAIL_FROM'));
console.log(Deno.env.get('ALERT_EMAIL'));
console.log(Deno.env.get('CHECK_INTERVAL'));