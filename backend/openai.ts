import { sendEmailNotification } from "./sender.ts";

// Email data interface
export interface EmailData {
    email: string;
    subject: string;
    message: string;
    date: string;
}

// Appointment interface
export interface Appointment {
    email: string;
    date: string;
    time: string;
    fullName: string;
    birthDate: string;
    phone: string;
    isCancellation: boolean;
}

// Analyze message
export function analyzeMessage(emailData: EmailData): void {
    // Run in a non-blocking way
    (async () => {
        try {
            // Check if this is a cancellation
            const isCancellation = checkIsCancellation(emailData.subject, emailData.message);
            if (!isCancellation) {
                console.log("Message does not appear to be a cancellation");
                return;
            }

            console.log("Message appears to be a cancellation, analyzing");

            // Get OpenAI API key
            const apiKey = Deno.env.get("OPENAI_API_KEY");
            if (!apiKey) {
                console.error("OPENAI_API_KEY not set");
                return;
            }

            // Analyze with OpenAI
            const prompt = `
        Analysieren Sie die folgende E-Mail und bestimmen Sie, ob sie mit einer Terminabsage in einer medizinischen Praxis zusammenhängt.
        Wenn es sich um eine Terminabsage handelt, extrahieren Sie bitte die folgenden Informationen:
        - E-Mail (bereits vorhanden)
        - Termin-Datum (falls verfügbar)
        - Termin-Uhrzeit (falls verfügbar)
        - Vollständiger Name des Patienten (falls verfügbar)
        - Geburtsdatum des Patienten (falls verfügbar)
        - Telefonnummer (falls verfügbar)
        
        Hier ist die E-Mail:
        FROM: ${emailData.email}
        SUBJECT: ${emailData.subject}
        MESSAGE: ${emailData.message}
        
        Antworten Sie im JSON-Format mit folgender Struktur:
        {
          "email": "E-Mail des Patienten",
          "date": "Termindatum oder leerer String",
          "time": "Terminzeit oder leerer String",
          "fullName": "Name des Patienten oder leerer String",
          "birthDate": "Geburtsdatum oder leerer String",
          "phone": "Telefonnummer oder leerer String",
          "isCancellation": true/false
        }
        
        Nur das JSON-Objekt ohne zusätzliche Formatierung. WICHTIG: Kein Markdown, keine Backticks, keine Anführungszeichen, nur das reine JSON.
      `;

            console.log("Sending request to OpenAI API...");

            const response = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: "gpt-4o",
                    messages: [
                        {
                            role: "system",
                            content: "You are a helpful assistant that analyzes emails to extract appointment cancellation information. Always respond with clean JSON without markdown formatting."
                        },
                        {
                            role: "user",
                            content: prompt,
                        },
                    ],
                    temperature: 0.2,
                }),
            });

            if (!response.ok) {
                console.error(`OpenAI API error: ${response.status} ${response.statusText}`);
                return;
            }

            const data = await response.json();
            let resultText = data.choices[0].message.content.trim();
            console.log("Raw OpenAI response:", resultText);

            // Fix: Clean up any markdown formatting before parsing
            // Remove markdown code blocks if present
            resultText = resultText.replace(/```json\s*/g, "");
            resultText = resultText.replace(/```\s*/g, "");
            // Remove any leading/trailing backticks
            resultText = resultText.replace(/^`+|`+$/g, "");

            // Parse response
            try {
                const appointment = JSON.parse(resultText) as Appointment;

                if (!appointment.isCancellation) {
                    console.log("Not a cancellation according to OpenAI analysis");
                    return;
                }

                // Save appointment data
                await saveAppointmentData(appointment);

                // Send notification
                sendEmailNotification(appointment);
            } catch (parseError) {
                console.error("JSON parsing error:", parseError, "for text:", resultText);
            }

        } catch (error) {
            console.error("Error analyzing message:", error);
        }
    })();
}

// Basic check for cancellation keywords
function checkIsCancellation(subject: string, message: string): boolean {
    const keywords = ["absage", "stornieren", "absagen", "abgesagt", "cancel", "kann nicht kommen"];

    const lowerSubject = subject.toLowerCase();
    const lowerMessage = message.toLowerCase();

    return keywords.some(word =>
        lowerSubject.includes(word) || lowerMessage.includes(word)
    );
}

// Save appointment data
async function saveAppointmentData(appointment: Appointment): Promise<void> {
    try {
        const filePath = "./appointments.json";
        let appointments: Appointment[] = [];

        try {
            const content = await Deno.readTextFile(filePath);
            appointments = JSON.parse(content);
        } catch {
            // File doesn't exist, start with empty array
        }

        appointments.push(appointment);
        await Deno.writeTextFile(filePath, JSON.stringify(appointments, null, 2));
        console.log("Appointment data saved successfully");
    } catch (error) {
        console.error("Error saving appointment data:", error);
    }
}