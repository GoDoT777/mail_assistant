import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { sendEmailNotification } from "./sender.ts";

// Define appointment schema
const AppointmentSchema = z.object({
    email: z.string(),
    date: z.string().optional(),
    time: z.string().optional(),
    fullName: z.string().optional(),
    birthDate: z.string().optional(),
    phone: z.string().optional(),
    isCancellation: z.boolean(),
});

type Appointment = z.infer<typeof AppointmentSchema>;

// Email data interface
interface EmailData {
    email: string;
    subject: string;
    message: string;
    date: string;
}

// Save appointment data to file
async function saveAppointment(appointment: Appointment): Promise<void> {
    try {
        const filePath = "./appointments.json";
        let appointments: Appointment[] = [];

        try {
            const existingData = await Deno.readTextFile(filePath);
            appointments = JSON.parse(existingData);
        } catch {
            // File doesn't exist or can't be read, start with empty array
        }

        appointments.push(appointment);
        await Deno.writeTextFile(filePath, JSON.stringify(appointments, null, 2));
        console.log("Appointment data saved successfully");
    } catch (error) {
        console.error("Error saving appointment data:", error);
    }
}

// Create a restart flag file
async function createRestartFlag(): Promise<void> {
    try {
        await Deno.writeTextFile("./restart_needed.txt", new Date().toISOString());
        console.log("Created restart flag file");
    } catch (error) {
        console.error("Failed to create restart flag:", error);
    }
}

// Function to analyze email for cancellation
export async function analyzeMessage(emailData: EmailData): Promise<boolean> {
    // Set a timeout for the entire analysis process
    const analysisTimeout = setTimeout(() => {
        console.log("Analysis timed out after 30 seconds");
        return false;
    }, 30000);

    try {
        // Check for OpenAI API key
        const apiKey = Deno.env.get("OPENAI_API_KEY");
        if (!apiKey) {
            console.error("OPENAI_API_KEY not set, cannot analyze message");
            clearTimeout(analysisTimeout);
            return false;
        }

        const prompt = `
      Analysieren Sie die folgende E-Mail und bestimmen Sie, ob sie mit einer Terminabsage in einer medizinischen Praxis zusammenhängt.
      Wenn es sich um eine Terminabsage handelt, extrahieren Sie bitte die folgenden Informationen:
      - E-Mail (bereits vorhanden)
      - Termin-Datum (falls verfügbar)
      - Termin-Uhrzeit (falls verfügbar)
      - Vollständiger Name des Patienten (falls verfügbar)
      - Geburtsdatum des Patienten (falls verfügbar)
      - Telefonnummer (falls verfügbar)
      
      Wenn Informationen nicht verfügbar sind, lassen Sie diese Felder leer.
      
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
      
      Antworten Sie nur mit dem JSON-Objekt ohne Markdown-Formatierung, keine Codeblöcke, keine zusätzlichen Beschreibungen. Nur das reine JSON-Objekt.
    `;

        console.log("Sending request to OpenAI API...");

        // Set up a controller for the fetch request
        const controller = new AbortController();
        const fetchTimeout = setTimeout(() => controller.abort(), 25000);

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
                        content: "You are a helpful assistant that analyzes emails to extract appointment information. Always respond with clean JSON without markdown formatting or code blocks.",
                    },
                    {
                        role: "user",
                        content: prompt,
                    },
                ],
                temperature: 0.2,
            }),
            signal: controller.signal,
        });

        clearTimeout(fetchTimeout);

        if (!response.ok) {
            console.error("Error from OpenAI API:", await response.text());
            clearTimeout(analysisTimeout);
            return false;
        }

        const data = await response.json();

        if (!data.choices || data.choices.length === 0) {
            console.error("No valid response from OpenAI");
            clearTimeout(analysisTimeout);
            return false;
        }

        let resultText = data.choices[0].message.content;
        console.log("Raw OpenAI response:", resultText);

        // Clean any markdown formatting
        resultText = resultText.replace(/```json\s*/, "").replace(/```\s*$/, "").trim();

        try {
            const jsonResponse = JSON.parse(resultText);

            // Add the original message for context
            jsonResponse.originalMessage = emailData.message;

            // Validate with Zod
            const appointmentResult = AppointmentSchema.safeParse(jsonResponse);

            if (!appointmentResult.success) {
                console.error("Invalid response format:", appointmentResult.error);
                clearTimeout(analysisTimeout);
                return false;
            }

            const appointment = appointmentResult.data;

            // If not a cancellation, no need for further processing
            if (!appointment.isCancellation) {
                console.log("Message is not related to appointment cancellation");
                clearTimeout(analysisTimeout);
                return true;
            }

            // Save appointment data
            await saveAppointment(appointment);

            // Send email notification
            console.log("Sending email notification for cancellation...");

            try {
                await sendEmailNotification({
                    ...appointment,
                    originalMessage: emailData.message
                });

                // Create restart flag
                await createRestartFlag();
            } catch (emailError) {
                console.error("Error sending email notification:", emailError);

                // Create restart flag even if email fails
                await createRestartFlag();
            }

            clearTimeout(analysisTimeout);
            return true;

        } catch (parseError) {
            console.error("Failed to parse JSON response:", parseError);
            clearTimeout(analysisTimeout);
            return false;
        }

    } catch (error) {
        console.error("Error in analysis process:", error);
        clearTimeout(analysisTimeout);
        return false;
    }
}