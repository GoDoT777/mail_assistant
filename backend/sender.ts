import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

// Appointment type
export type Appointment = {
    email: string;
    date?: string;
    time?: string;
    fullName?: string;
    birthDate?: string;
    phone?: string;
    isCancellation: boolean;
    originalMessage?: string;
};

// Clean text from email artifacts
function cleanText(text: string | undefined): string {
    if (!text) return "Nicht verfügbar";

    return text
        // Remove =XX combinations
        .replace(/=([0-9A-F]{2})/g, (_, hex) => {
            try {
                return String.fromCharCode(parseInt(hex, 16));
            } catch {
                return "";
            }
        })
        // Remove all =20
        .replace(/=20/g, " ")
        // Remove line breaks in QP encoding
        .replace(/=\r\n/g, "")
        .replace(/=\n/g, "")
        // Replace German symbols
        .replace(/=C3=B6/gi, "ö")
        .replace(/=C3=A4/gi, "ä")
        .replace(/=C3=BC/gi, "ü")
        .replace(/=C3=9F/gi, "ß")
        .replace(/=C3=84/g, "Ä")
        .replace(/=C3=96/g, "Ö")
        .replace(/=C3=9C/g, "Ü")
        // Remove any remaining =XX symbols
        .replace(/=[A-F0-9]{2}/g, "")
        // Remove extra spaces
        .replace(/\s+/g, " ")
        .trim();
}

// Send email notification about cancellation
export async function sendEmailNotification(appointment: Appointment): Promise<void> {
    // Check SMTP settings
    const smtpHost = Deno.env.get("SMTP_HOST") || "smtp.zoho.eu";
    const smtpPort = parseInt(Deno.env.get("SMTP_PORT") || "465");
    const smtpUsername = Deno.env.get("SMTP_USERNAME");
    const smtpPassword = Deno.env.get("SMTP_PASSWORD");
    const senderEmail = Deno.env.get("SENDER_EMAIL") || smtpUsername || "";
    const receiverEmail = Deno.env.get("RECEIVER_EMAIL") || appointment.email || "";

    if (!smtpUsername || !smtpPassword || !senderEmail || !receiverEmail) {
        console.log("Email credentials incomplete. Email not sent.");
        return;
    }

    // Clean message
    const cleanedMessage = cleanText(appointment.originalMessage);

    // Prepare email content
    const emailSubject = "Terminabsage eingegangen";
    const emailBody = "Sehr geehrtes Praxisteam,\n\n" +
        "Ein Patient hat einen Termin abgesagt.\n\n" +
        "Email: " + appointment.email + "\n" +
        "Name: " + (appointment.fullName || "Nicht angegeben") + "\n" +
        "Datum: " + (appointment.date || "Nicht angegeben") + "\n" +
        "Zeit: " + (appointment.time || "Nicht angegeben") + "\n" +
        (appointment.birthDate ? "Geburtsdatum: " + appointment.birthDate + "\n" : "") +
        (appointment.phone ? "Telefon: " + appointment.phone + "\n" : "") +
        "\nOriginal Nachricht:\n" +
        cleanedMessage + "\n\n" +
        "Mit freundlichen Grüßen\n" +
        "Ihr System";

    const htmlBody = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body style="font-family: Arial, sans-serif;">
  <h2>Terminabsage eingegangen</h2>
  <p>Sehr geehrtes Praxisteam,</p>
  <p>Ein Patient hat einen Termin abgesagt.</p>
  <p>Email: ${appointment.email}<br>
  Name: ${appointment.fullName || "Nicht angegeben"}<br>
  Datum: ${appointment.date || "Nicht angegeben"}<br>
  Zeit: ${appointment.time || "Nicht angegeben"}<br>
  ${appointment.birthDate ? "Geburtsdatum: " + appointment.birthDate + "<br>" : ""}
  ${appointment.phone ? "Telefon: " + appointment.phone + "<br>" : ""}</p>
  <p>Original Nachricht:<br>
  ${cleanedMessage}</p>
  <p>Mit freundlichen Grüßen<br>
  Ihr System</p>
</body>
</html>`;

    let client: SMTPClient | null = null;

    // Overall timeout for the email process
    const overallTimeout = setTimeout(() => {
        console.log("Email process timed out");
        throw new Error("Email process timed out");
    }, 15000);

    try {
        console.log("Creating SMTP client");
        client = new SMTPClient({
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

        console.log("Sending email");
        await client.send({
            from: senderEmail,
            to: receiverEmail,
            subject: emailSubject,
            content: emailBody,
            html: htmlBody,
        });

        console.log("Email sent successfully");
    } catch (error) {
        console.error("Error in email process:", error);
        throw error;
    } finally {
        clearTimeout(overallTimeout);

        // Clean up client
        if (client) {
            try {
                console.log("Closing SMTP client");
                await client.close();
                console.log("SMTP client closed");
            } catch (closeError) {
                console.error("Error closing SMTP client:", closeError);
            }
        }
    }
}