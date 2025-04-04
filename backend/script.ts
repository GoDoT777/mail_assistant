import {
  ImapClient,
  fetchUnreadMessages,
  markMessagesAsRead,
} from "https://raw.githubusercontent.com/bobbyg603/deno-imap/main/mod.ts";
import type { ImapMessagePart } from "https://raw.githubusercontent.com/bobbyg603/deno-imap/main/mod.ts";
import { analyzeMessage } from "./openai.ts";

const OUTPUT_FILE = "./mails.json";
const RESTART_FLAG_FILE = "./restart_needed.txt";

// Validate required environment variables
function validateEnvironment() {
  const requiredVars = ["IMAP_HOST", "IMAP_PORT", "IMAP_USERNAME", "IMAP_PASSWORD"];
  const missingVars = requiredVars.filter(varName => !Deno.env.get(varName));

  if (missingVars.length > 0) {
    console.error(`Missing required environment variables: ${missingVars.join(", ")}`);
    Deno.exit(1);
  }
}

// Check if restart is needed
async function checkRestartNeeded(): Promise<boolean> {
  try {
    await Deno.stat(RESTART_FLAG_FILE);
    console.log("Restart flag detected");

    try {
      await Deno.remove(RESTART_FLAG_FILE);
      console.log("Restart flag removed");
    } catch (e) {
      console.error("Failed to remove restart flag:", e);
    }

    return true;
  } catch {
    return false;
  }
}

// Restart the application
function restartApplication() {
  console.log("\n=== RESTARTING APPLICATION ===");

  try {
    const scriptPath = Deno.mainModule.split("file://")[1];

    const cmd = new Deno.Command(Deno.execPath(), {
      args: ["run", "--allow-net", "--allow-read", "--allow-write", "--allow-env", scriptPath],
    });

    cmd.spawn();
    console.log("New process started, this process will exit");

    setTimeout(() => Deno.exit(0), 1000);
  } catch (error) {
    console.error("Failed to restart:", error);
    setTimeout(main, 10000);
  }
}

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

// Extract message text
function extractMessageText(content: string): string {
  return content
    .replace(/=\r\n/g, "")
    .replace(/=20/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Core email checking function
async function checkEmails() {
  console.log("\n=== Checking for new emails ===");

  // Check for restart first
  if (await checkRestartNeeded()) {
    restartApplication();
    return;
  }

  // Create IMAP client
  const client = new ImapClient({
    host: Deno.env.get("IMAP_HOST")!,
    port: parseInt(Deno.env.get("IMAP_PORT")!),
    tls: Deno.env.get("IMAP_USE_TLS") !== "false",
    username: Deno.env.get("IMAP_USERNAME")!,
    password: Deno.env.get("IMAP_PASSWORD")!,
  });

  try {
    // Connect and authenticate
    await client.connect();
    await client.authenticate();
    console.log("Connected to IMAP server");

    // Select INBOX
    await client.selectMailbox("INBOX");

    // Fetch unread messages - not using unseen searchCriteria
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

            // Look for TEXT part first
            if (fullMessage.parts.TEXT && fullMessage.parts.TEXT.data) {
              console.log("Using part TEXT (text/plain) for message body");
              const rawContent = new TextDecoder().decode(fullMessage.parts.TEXT.data);
              messageContent = extractMessageText(rawContent);
            }
            // Then try any text part
            else {
              for (const key of partKeys) {
                const part = fullMessage.parts[key] as ImapMessagePart | undefined;
                if (part && part.data) {
                  const rawContent = new TextDecoder().decode(part.data);
                  messageContent = extractMessageText(rawContent);
                  console.log(`Using part ${key} for message body`);
                  break;
                }
              }
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
        await analyzeMessage(emailData);

        // Check for restart flag after analysis
        if (await checkRestartNeeded()) {
          break;
        }

        // Mark the message as read
        if (message.uid) {
          await markMessagesAsRead(client, "INBOX", [message.uid], true);
        } else {
          await markMessagesAsRead(client, "INBOX", [message.seq]);
        }
        console.log(`Marked message ${message.seq} as read`);

      } catch (messageError) {
        console.error(`Error processing message ${message.seq}:`, messageError);
      }
    }

  } catch (error) {
    console.error("Error during email check:", error);
  } finally {
    // CRITICAL: Always disconnect client in finally block
    try {
      // Set a timeout for the disconnect operation
      const disconnectPromise = client.disconnect();
      const timeoutPromise = new Promise<void>((resolve) => {
        setTimeout(() => {
          console.warn("Disconnect timed out after 5 seconds, continuing anyway");
          resolve();
        }, 5000);
      });

      // Use Promise.race to avoid hanging on disconnect
      await Promise.race([disconnectPromise, timeoutPromise]);
      console.log("Disconnected from IMAP server");
    } catch (disconnectError) {
      console.error("Error during disconnect:", disconnectError);
    }

    // Continue with next check or restart
    if (await checkRestartNeeded()) {
      restartApplication();
    } else {
      console.log("Scheduling next check in 10 seconds");
      setTimeout(main, 10000);
    }
  }
}

// Main function
async function main() {
  validateEnvironment();
  await checkEmails();
}

// Start the process
if (import.meta.main) {
  main();
}