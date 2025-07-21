
const express = require('express');
const { WebhookClient } = require('dialogflow-fulfillment');
const { google } = require('googleapis');
const dialogflow = require('@google-cloud/dialogflow');
const cors = require('cors');
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();

app.use(cors({
    origin: 'http://localhost:5173'
}));
app.use(express.json());

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID;
const DIALOGFLOW_AGENT_ID = process.env.DIALOGFLOW_AGENT_ID;
const FIREBASE_SERVICE_ACCOUNT_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!FIREBASE_SERVICE_ACCOUNT_PATH) {
    console.error('ERROR: GOOGLE_APPLICATION_CREDENTIALS is not set in your .env file!');
    process.exit(1);
}

const absoluteServiceAccountPath = path.resolve(FIREBASE_SERVICE_ACCOUNT_PATH);
console.log(`Attempting to load service account key from: ${absoluteServiceAccountPath}`);

if (!fs.existsSync(absoluteServiceAccountPath)) {
    console.error(`ERROR: Service account key file NOT FOUND at: ${absoluteServiceAccountPath}`);
    console.error('Please verify the GOOGLE_APPLICATION_CREDENTIALS path in your .env file.');
    process.exit(1);
}

try {
  const serviceAccount = require(absoluteServiceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log('Firebase Admin SDK initialized successfully.');
} catch (error) {
  console.error('ERROR: Failed to initialize Firebase Admin SDK.');
  console.error('Please check GOOGLE_APPLICATION_CREDENTIALS path in your .env file and ensure the JSON key file exists and is valid.');
  console.error('Detailed error:', error.message);
  process.exit(1);
}

const db = admin.firestore();

const oauth2Client = new google.auth.OAuth2(
    CLIENT_ID,
    CLIENT_SECRET,
    REDIRECT_URI
);

const SCOPES = ['https://www.googleapis.com/auth/calendar'];

const sessionClient = new dialogflow.SessionsClient();

app.get('/auth/google', (req, res) => {
    const sessionId = req.query.sessionId; // Get sessionId from frontend query parameter

    if (!sessionId) {
        console.error('ERROR: Session ID missing from /auth/google request. Cannot initiate OAuth.');
        return res.status(400).send('Session ID is missing. Please ensure your frontend sends it.');
    }

    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent',
        state: sessionId // Pass the dynamic sessionId through the state
    });
    console.log('Redirecting user to Google for authentication with state (sessionId):', sessionId);
    res.redirect(authUrl);
});

app.get('/oauth2callback', async (req, res) => {
    const code = req.query.code;
    const sessionId = req.query.state; // Retrieve the dynamic sessionId from the state parameter

    if (!code) {
        console.error('OAuth2 Callback: No authorization code received.');
        return res.status(400).send('Authorization failed: No code received.');
    }
    if (!sessionId) {
        console.error('OAuth2 Callback: Session ID missing from state parameter.');
        return res.status(400).send('Authentication failed: Session ID missing.');
    }

    try {
        const { tokens } = await oauth2Client.getToken(code);
        // Store tokens in Firestore using the dynamic sessionId
        await db.collection('userTokens').doc(sessionId).set(tokens);
        console.log('Successfully obtained and stored tokens in Firestore for session:', sessionId);
        res.status(200).send('Authentication successful! You can now close this tab and go back to the chatbot.');

    } catch (error) {
        console.error('Error exchanging code for tokens (in /oauth2callback):', error.message);
        res.status(500).send('Authentication failed. Please try again.');
    }
});

 //function to get an authenticated Google Calendar client 
async function getAuthenticatedCalendarClient(sessionId) { // Accept sessionId as argument
    // Retrieve tokens from Firestore using the provided sessionId
    const docRef = db.collection('userTokens').doc(sessionId);
    const doc = await docRef.get();

    if (!doc.exists) {
        throw new Error('User not authenticated. No tokens found for this session.');
    }

    let tokens = doc.data();

    oauth2Client.setCredentials(tokens);

    if (oauth2Client.isTokenExpiring()) {
        console.log('Access token expiring, refreshing...');
        const { tokens: newTokens } = await oauth2Client.refreshAccessToken();
        await docRef.set(newTokens, { merge: true });
        tokens = newTokens;
        console.log('Tokens refreshed successfully and updated in Firestore.');
    }

    oauth2Client.setCredentials(tokens);
    return google.calendar({ version: 'v3', auth: oauth2Client });
}


//Endpoint for Frontend Chat (/chat)
app.post('/chat', async (req, res) => {
    const userMessage = req.body.message;
    const sessionId = req.body.sessionId; // Extract sessionId from the request body

    if (!userMessage) {
        return res.status(400).json({ reply: 'No message provided.' });
    }
    if (!sessionId) {
        // This is a critical error: frontend didn't send sessionId
        console.error('ERROR: Session ID missing from frontend /chat request.');
        return res.status(400).json({ reply: 'Session ID is missing. Please refresh the page.' });
    }

    try {
        // Use the dynamic sessionId to construct the sessionPath for Dialogflow
        const dynamicSessionPath = sessionClient.projectAgentSessionPath(PROJECT_ID, sessionId);

        const request = {
            session: dynamicSessionPath, // Use the dynamic session path
            queryInput: {
                text: {
                    text: userMessage,
                    languageCode: 'en-US',
                },
            },
        };

        const responses = await sessionClient.detectIntent(request);
        const result = responses[0].queryResult;

        let fulfillmentText = result.fulfillmentText;

        console.log(`Frontend Chat - User: "${userMessage}" (Session ID: ${sessionId})`);
        console.log(`Dialogflow Detected Intent: "${result.intent ? result.intent.displayName : 'None'}"`);
        console.log(`Dialogflow Fulfillment Text: "${fulfillmentText}"`);

        if (fulfillmentText.includes('It looks like your Google Calendar isn\'t linked yet')) {
            return res.json({ reply: fulfillmentText, needsAuth: true });
        }

        res.json({ reply: fulfillmentText });

    } catch (error) {
        console.error('Error in /chat endpoint (calling Dialogflow detectIntent):', error.message);
        res.status(500).json({ reply: 'An error occurred while processing your message.' });
    }
});


// Dialogflow Webhook Endpoint (for Fulfillment)
app.post('/webhook', (req, res) => {
    const agent = new WebhookClient({ request: req, response: res });
    console.log('Dialogflow Request Body (from Fulfillment):', JSON.stringify(req.body, null, 2));

    
    const dialogflowSessionIdMatch = req.body.session.match(/sessions\/(.*)$/);
    const dialogflowSessionId = dialogflowSessionIdMatch ? dialogflowSessionIdMatch[1] : 'unknown-session';

    console.log(`Fulfillment Webhook received for Session ID: ${dialogflowSessionId}`);


    function welcome(agent) {
        agent.add(`Hello! I'm your Calendar AI Assistant. What would you like to do?`);
        console.log('Welcome Intent handled.');
    }

    function fallback(agent) {
        agent.add(`Sorry, I didn't understand. Could you please tell again.`);
        console.log('Fallback Intent handled.');
    }

    async function handleBookAppointment(agent) {
        const dateTimeParam = agent.parameters['date-time'];
        const personParam = agent.parameters.person;
        let subject = agent.parameters.subject;

        const eventDateTimeISO = dateTimeParam && dateTimeParam.date_time ? dateTimeParam.date_time : null;

        const date = eventDateTimeISO ? eventDateTimeISO.split('T')[0] : 'N/A';
        const time = eventDateTimeISO ? eventDateTimeISO.split('T')[1].substring(0, 5) : 'N/A';
        const personName = personParam && personParam.name ? personParam.name : 'someone';

        console.log('---- book.appointment Intent Parameters (from Fulfillment) ----');
        console.log('Event DateTime ISO:', eventDateTimeISO);
        console.log('Date (extracted for display):', date);
        console.log('Time (extracted for display):', time);
        console.log('Subject:', subject);
        console.log('Person:', personName);
        console.log('Fulfillment Session ID:', dialogflowSessionId); // Log the session ID here
        console.log('-----------------------------------------');

        if (!eventDateTimeISO) {
            agent.add("I need a specific date and time to book the appointment. Can you provide those?");
            return;
        }

        if (!subject || subject.trim() === '') {
            subject = `Meeting with ${personName}`;
        }

        try {
            // Pass the Dialogflow session ID to getAuthenticatedCalendarClient
            // This ensures the correct user's tokens are loaded from Firestore.
            const calendar = await getAuthenticatedCalendarClient(dialogflowSessionId);

            const eventStartTime = eventDateTimeISO;
            const tempStartDate = new Date(eventDateTimeISO);
            const eventEndTime = new Date(tempStartDate.getTime() + 60 * 60 * 1000).toISOString();

            const timeZone = agent.parameters.timeZone || 'Asia/Kolkata';

            const event = {
                summary: subject,
                description: `Scheduled via Calendar AI Assistant.`,
                start: {
                    dateTime: eventStartTime,
                    timeZone: timeZone,
                },
                end: {
                    dateTime: eventEndTime,
                    timeZone: timeZone,
                },
                attendees: personName !== 'someone' ? [{ email: `${personName.toLowerCase().replace(/\s/g, '')}@example.com` }] : [],
                reminders: {
                    useDefault: false,
                    overrides: [
                        { method: 'email', minutes: 30 },
                        { method: 'popup', minutes: 10 },
                    ],
                },
            };

            const response = await calendar.events.insert({
                calendarId: 'primary',
                resource: event,
            });

            const eventLink = response.data.htmlLink;

            let successMessage = `Okay, I've booked your appointment for ${date} at ${time}.`;
            successMessage += ` The topic is "${subject}".`;
            if (personName !== 'someone') {
                successMessage += ` You're meeting with ${personName}.`;
            }
            successMessage += ` You can view it here: ${eventLink}`;
            agent.add(successMessage);

            console.log('Google Calendar event created:', eventLink);
            console.log('book.appointment intent handler finished.');

        } catch (error) {
            console.error('Error booking appointment with Google Calendar (from Fulfillment):', error.message);
            let errorMessage = "I encountered an error while trying to book your appointment. Please try again later.";

            if (error.message.includes('User not authenticated')) {
              
                errorMessage = `It looks like your Google Calendar isn't linked yet. Please visit this link to authorize me: \`${app.get('host') || `http://localhost:${PORT}`}/auth/google?sessionId=${dialogflowSessionId}\``;
            } else if (error.code === 401 || error.code === 403) {
                 errorMessage = `I'm having trouble accessing your calendar. Please try re-authenticating by visiting this link: \`${app.get('host') || `http://localhost:${PORT}`}/auth/google?sessionId=${dialogflowSessionId}\``;
            } else {
                errorMessage += ` Error details: ${error.message}`;
            }
            agent.add(errorMessage);
        }
    }

    let intentMap = new Map();
    intentMap.set('Default Welcome Intent', welcome);
    intentMap.set('Default Fallback Intent', fallback);
    intentMap.set('book.appointment', handleBookAppointment);

    agent.handleRequest(intentMap);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`AI assistant backend is running on PORT: ${PORT}`);
    console.log(`Webhook URL for Dialogflow: http://localhost:${PORT}/webhook`);
    console.log(`Google OAuth URL: http://localhost:${PORT}/auth/google`);
    console.log(`Frontend Chat Endpoint: http://localhost:${PORT}/chat`);
});
