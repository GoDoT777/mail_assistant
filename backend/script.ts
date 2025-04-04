import { ImapClient } from "https://raw.githubusercontent.com/bobbyg603/deno-imap/main/mod.ts";
import { analyzeMessage } from "./openai.ts";
import { fetchUnreadMessages, markMessagesAsRead } from "https://raw.githubusercontent.com/bobbyg603/deno-imap/main/mod.ts";

const OUTPUT_FILE = "./mails.json";

// Store email data
interface EmailData {
  email: string;
  subject: string;
  message: string;
  date: string;
}

// Read existing emails
async function readEmails(): Promise<EmailData[]> {
  try {
    const data = await Deno.readTextFile(OUTPUT_FILE);
    return JSON.parse(data);
  } catch {
    return [];
  }
}

// Save new email
async function saveEmail(email: EmailData): Promise<void> {
  const emails = await readEmails();
  emails.push(email);
  await Deno.writeTextFile(OUTPUT_FILE, JSON.stringify(emails, null, 2));
  console.log(`Email saved to ${OUTPUT_FILE}`);
}

// Check for new emails
async function checkEmails() {
  console.log("\n=== Checking for new emails ===");

  // Create IMAP client
  const client = new ImapClient({
    host: Deno.env.get("IMAP_HOST") || "",
    port: parseInt(Deno.env.get("IMAP_PORT") || "993"),
    tls: Deno.env.get("IMAP_USE_TLS") !== "false",
    username: Deno.env.get("IMAP_USERNAME") || "",
    password: Deno.env.get("IMAP_PASSWORD") || "",
  });

  try {
    // Connect and authenticate
    await client.connect();
    await client.authenticate();
    console.log("Connected to IMAP server");

    // Select INBOX
    await client.selectMailbox("INBOX");

    // Fetch unread messages using the imported function
    const unreadMessages = await fetchUnreadMessages(client, "INBOX");
    console.log(`Found ${unreadMessages.length} unread messages`);

    // Process each message
    for (const message of unreadMessages) {
      try {
        console.log(`Processing message ${message.seq}`);

        if (!message.envelope) {
          console.warn(`No envelope for message ${message.seq}, skipping`);
          continue;
        }

        // Extract email details
        const senderEmail = (message.envelope.from?.[0]?.mailbox || "unknown") +
          "@" +
          (message.envelope.from?.[0]?.host || "unknown.com");
        const subject = message.envelope.subject || "(No subject)";

        console.log(`Subject: ${subject}`);
        console.log(`From: ${senderEmail}`);

        // Fetch message content
        const fullMessages = await client.fetch(
          message.seq.toString(),
          { full: true, markSeen: false }
        );

        let messageContent = "(Message body unavailable)";

        if (fullMessages.length > 0) {
          const fullMessage = fullMessages[0];

          if (fullMessage.parts) {
            const partKeys = Object.keys(fullMessage.parts);
            console.log("Available message parts:", partKeys);

            if (fullMessage.parts.TEXT && fullMessage.parts.TEXT.data) {
              console.log("Using part TEXT for message body");
              const rawContent = new TextDecoder().decode(fullMessage.parts.TEXT.data);
              messageContent = rawContent
                .replace(/=\r\n/g, "")
                .replace(/=20/g, " ")
                .replace(/\s+/g, " ")
                .trim();
            }
          }

          console.log("Message content preview:", messageContent.substring(0, 100) + "...");
        }

        // Save the email
        const emailData: EmailData = {
          email: senderEmail,
          subject: subject,
          message: messageContent,
          date: message.envelope.date ? new Date(message.envelope.date).toISOString() : new Date().toISOString()
        };

        await saveEmail(emailData);

        // Analyze the message
        console.log("Analyzing message with OpenAI...");
        analyzeMessage(emailData);

        // Mark the message as read using the imported function
        await markMessagesAsRead(client, "INBOX", [message.seq]);
        console.log(`Marked message ${message.seq} as read`);

      } catch (messageError) {
        console.error(`Error processing message ${message.seq}:`, messageError);
      }
    }

  } catch (error) {
    console.error("Error during email check:", error);
  } finally {
    // Disconnect
    try {
      await client.disconnect();
      console.log("Disconnected from IMAP server");
    } catch (disconnectError) {
      console.error("Error during disconnect:", disconnectError);
    }
  }
}

// Main function
async function main() {
  try {
    await checkEmails();
  } catch (error) {
    console.error("Error in main function:", error);
  } finally {
    // Schedule next check
    console.log("Scheduling next check in a minute");
    setTimeout(main, 60000);
  }
}

// Start the process
if (import.meta.main) {
  main();
}