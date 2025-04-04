import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { Appointment } from "./openai.ts";

// Send email notification
export function sendEmailNotification(appointment: Appointment): void {
    (async () => {
        try {
            console.log("Sending email notification for cancellation...");

            // Get SMTP settings
            const smtpHost = Deno.env.get("SMTP_HOST") || "";
            const smtpPort = parseInt(Deno.env.get("SMTP_PORT") || "465");
            const smtpUsername = Deno.env.get("SMTP_USERNAME") || "";
            const smtpPassword = Deno.env.get("SMTP_PASSWORD") || "";
            const senderEmail = Deno.env.get("SENDER_EMAIL") || smtpUsername;
            const recipientEmail = Deno.env.get("RECEIVER_EMAIL") || "";

            // Check settings
            if (!smtpHost || !smtpUsername || !smtpPassword || !recipientEmail) {
                console.error("Some SMTP settings are missing");
                return;
            }

            // Create email content
            const emailSubject = "Terminabsage eingegangen";
            const emailBody = `Sehr geehrtes Praxisteam,

Ein Patient hat einen Termin abgesagt.

Email: ${appointment.email}
Name: ${appointment.fullName || "Nicht angegeben"}
Datum: ${appointment.date || "Nicht angegeben"}
Zeit: ${appointment.time || "Nicht angegangen"}
${appointment.birthDate ? "Geburtsdatum: " + appointment.birthDate : ""}
${appointment.phone ? "Telefon: " + appointment.phone : ""}

Mit freundlichen Grüßen
Ihr System`;

            // Create HTML version
            const htmlBody = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body style="font-family: Arial, sans-serif;">
  <h2>Terminabsage eingegangen</h2>
  <p>Sehr geehrtes Praxisteam,</p>
  <p>Ein Patient hat einen Termin abgesagt.</p>
  <table>
    <tr><td>Email:</td><td>${appointment.email}</td></tr>
    <tr><td>Name:</td><td>${appointment.fullName || "Nicht angegeben"}</td></tr>
    <tr><td>Datum:</td><td>${appointment.date || "Nicht angegeben"}</td></tr>
    <tr><td>Zeit:</td><td>${appointment.time || "Nicht angegeben"}</td></tr>
    ${appointment.birthDate ? `<tr><td>Geburtsdatum:</td><td>${appointment.birthDate}</td></tr>` : ""}
    ${appointment.phone ? `<tr><td>Telefon:</td><td>${appointment.phone}</td></tr>` : ""}
  </table>
  <p>Mit freundlichen Grüßen<br>
  Ihr System</p>
</body>
</html>`;

            // Create SMTP client
            console.log(`Creating SMTP client for ${smtpHost}:${smtpPort}`);
            const client = new SMTPClient({
                connection: {
                    hostname: smtpHost,
                    port: smtpPort,
                    tls: true,
                    auth: {
                        username: smtpUsername,
                        password: smtpPassword,
                    }
                },
            });

            try {
                // Send email
                console.log(`Sending email from ${senderEmail} to ${recipientEmail}`);
                await client.send({
                    from: senderEmail,
                    to: recipientEmail,
                    subject: emailSubject,
                    content: emailBody,
                    html: htmlBody,
                });
                console.log("Email sent successfully");
            } finally {
                // Always close the client
                try {
                    await client.close();
                    console.log("SMTP client closed");
                } catch (closeError) {
                    console.error("Error closing SMTP client:", closeError);
                }
            }

        } catch (error) {
            console.error("Error sending email notification:", error);
        }
    })();
}