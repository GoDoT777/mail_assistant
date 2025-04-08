// nodemailer_client.ts
import { createTransport } from "npm:nodemailer@6.9.5";
import { Appointment } from "./openai.ts";

// Create a single transport instance to be reused
const smtpHost = Deno.env.get("SMTP_HOST") || "";
const smtpPort = parseInt(Deno.env.get("SMTP_PORT") || "465");
const smtpUsername = Deno.env.get("SMTP_USERNAME") || "";
const smtpPassword = Deno.env.get("SMTP_PASSWORD") || "";
const senderEmail = Deno.env.get("SENDER_EMAIL") || smtpUsername;
const recipientEmail = Deno.env.get("RECEIVER_EMAIL") || "";

const transporter = createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: true, // true for port 465
    auth: {
        user: smtpUsername,
        pass: smtpPassword,
    },
});

// Send email notification
export function sendEmailNotification(appointment: Appointment): void {
    (async () => {
        try {
            console.log("Sending email notification via Nodemailer...");

            const info = await transporter.sendMail({
                from: senderEmail,
                to: recipientEmail,
                subject: "Terminabsage eingegangen",
                text: `Ein Patient hat einen Termin abgesagt. Email: ${appointment.email}, Name: ${appointment.fullName || "Nicht angegeben"}, Datum: ${appointment.date || "Nicht angegeben"}, Zeit: ${appointment.time || "Nicht angegangen"}`,
                html: `
          <h2>Terminabsage eingegangen</h2>
          <p>Sehr geehrtes Praxisteam,</p>
          <p>Ein Patient hat einen Termin abgesagt.</p>
          <table>
            <tr><td>Email:</td><td>${appointment.email}</td></tr>
            <tr><td>Name:</td><td>${appointment.fullName || "Nicht angegeben"}</td></tr>
            <tr><td>Datum:</td><td>${appointment.date || "Nicht angegeben"}</td></tr>
            <tr><td>Zeit:</td><td>${appointment.time || "Nicht angegangen"}</td></tr>
            ${appointment.birthDate ? `<tr><td>Geburtsdatum:</td><td>${appointment.birthDate}</td></tr>` : ""}
            ${appointment.phone ? `<tr><td>Telefon:</td><td>${appointment.phone}</td></tr>` : ""}
          </table>
          <p>Mit freundlichen Grüßen<br>
          Ihr System</p>
        `
            });

            console.log("Email notification sent:", info.messageId);

        } catch (error) {
            console.error("Failed to send email notification:", error);
        }
    })();
}

// Close the transport when shutting down the application
export function closeEmailClient(): void {
    transporter.close();
    console.log("Email client closed");
}