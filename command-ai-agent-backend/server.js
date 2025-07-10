//main server to handle everything.(oauth2.0 and managing the calendar)
const express = require('express');
const { WebhookClient } = require('dialogflow-fulfillment');
const { google } = require('googleapis')
require('dotenv').config(); // Loads environment variables from .env file

const app = express();
app.use(express.json());

//GOOGLE oauth setup
//getting the credentials from env
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI


//configure oauth client
const oauth2Client = new google.auth.OAuth2(
    CLIENT_ID,
    CLIENT_SECRET,
    REDIRECT_URI
)

//defining the permissions for google calendar;
const SCOPES = ['https://www.googleapis.com/auth/calendar']

let userTokens = null; //storing access and refresh tokens for current user

//route to start the google auth flow
app.get('/auth/google', (req, res) => {
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent' //showing conset screen for re-auhtorization
    });
    console.log('Redirecting the user for the authentication', authUrl);
    res.redirect(authUrl);

})

//Oauth callback route
//redirecting user here after granting/removing permission
app.get('/oauth2callback', async (req, res) => {
    const code = req.query.code //auth code from google
    if (!code) {
        console.error('Oauth2 callback error: no code provided');
        return res.status(400).send('Authorization failed, no code received');
    }

    try {
        const { tokens } = await oauth2Client.getToken(code); //exchaning authorization code for access and refresh token(userToken)
        userTokens = tokens //temp store
        console.log('success in getting token', tokens);
        res.status(200).send('Authentication success, can close this and go to chat')
        //this is storing temporary, server gets restart user need to re-auth again.

    } catch (error) {
        console.error('Error in exchaning code', error.message);
        res.status(500).send('Authentication failed, try again')

    }
})


//function to get user to google calendar
async function getAuthenticatedCalendarClient() {
    if (!userTokens) {
        throw new Error('User not authenticated, first authenticate user')
    }

    //if token is expired, use refresh token to get a new
    if (oauth2Client.isTokenExpiring()) {
        console.log('Acess token expiring, refreshing..');
        const { tokens } = await oauth2Client.refreshAccessToken();
        userTokens = tokens;
        console.log('token refreshed successfully');
    }
    oauth2Client.setCredentials(userTokens)
    return google.calendar({ version: 'v3', auth: oauth2Client })
}

// app.get('/', (req, res) => {
//     res.status(200).send("AI Assistant backend is running");
// });

// Defining the Dialogflow webhook endpoints with real tasks
app.post('/webhook', (req, res) => {
    // Create a WebhookClient instance to handle the Dialogflow request and response
    const agent = new WebhookClient({ request: req, response: res });
    console.log('Dialogflow Request Body:', JSON.stringify(req.body, null, 2));

    //Intent Handlers

    function welcome(agent) {
        agent.add(`Hello! I'm your AI assistant. I can help you book, check or manage tasks.`);
        console.log('Welcome Intent handled.');
    }

    function fallback(agent) {
        agent.add(`Sorry, I didn't understand. Could you please tell again.`);
        console.log('Fallback Intent handled.');
    }

    // book.appointment intent handler(intent in dialogflow)
    async function handleBookAppointment(agent) {
        const dateTimeParam = agent.parameters['date-time'];
        const personParam = agent.parameters.person;
        const subject = agent.parameters.subject;
        const eventDateTimeISO = dateTimeParam && dateTimeParam.date_time ? dateTimeParam.date_time : null;
        //extract date, time, and person name
        const date = eventDateTimeISO ? eventDateTimeISO.split('T')[0] : 'N/A';
        const time = eventDateTimeISO ? eventDateTimeISO.split('T')[1].substring(0, 5) : 'N/A';
        const personName = personParam && personParam.name ? personParam.name : 'someone';

        console.log('---- book.appointment Intent Parameters ----');
        console.log('Date:', date);
        console.log('Time:', time);
        console.log('Subject:', subject);
        console.log('Person:', personName);
        console.log('-----------------------------------------'); //check for these logs in local shell

        if (!eventDateTimeISO) {
            agent.add('I need a specific time and date to book an appointment. Provide correct data and time')
            return;
        }

        if (!subject || subject.trim() === '') {
            subject = `Meeting with ${personName}`;
        }
        
        //google calendar api call
        try {
            const calendar = await getAuthenticatedCalendarClient()
            const eventStartTime = eventDateTimeISO;
            const tempStartDate = new Date(eventDateTimeISO)
            const eventEndTime = new Date(tempStartDate.getTime() + 60 + 60 * 1000) // 1hour default

            const timeZone = agent.parameters.timeZone || 'Asia/Kolkata'

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
          
                // This is a placeholder for demonstration.
                attendees: personName !== 'someone' ? [{ email: `${personName.toLowerCase().replace(/\s/g, '')}@example.com` }] : [],
                reminders: {
                    useDefault: false,
                    overrides: [
                        { method: 'email', minutes: 30 },
                        { method: 'popup', minutes: 10 },
                    ],
                },
            };

            const response = await calendar.events.insert({ //main api call to create an event
                calendarId: 'primary',
                resource: event,
            });


            const eventLink = response.data.htmlLink;
            agent.add(`Okay, I've booked your appointment for ${date} at ${time}.`);
            if (subject) agent.add(`The topic is "${subject}".`);
            if (personName) agent.add(`You're meeting with ${personName}.`);
            agent.add(`You can view it here: ${eventLink}`);
            console.log('Google Calendar event created:', eventLink);

        } catch (error) {
            console.error('Error booking appointment with Google Calendar:', error.message);
            if (error.message.includes('User not authenticated')) {
                agent.add("It looks like your Google Calendar isn't linked yet. Please visit this link to authorize me: `http://localhost:5000/auth/google` (replace 5000 with your actual port if different).");
            } else if (error.code === 401 || error.code === 403) {
                agent.add("I'm having trouble accessing your calendar. Please try re-authenticating by visiting this link: `http://localhost:5000/auth/google` (replace 5000 with your actual port if different).");
            } else {
                agent.add("I encountered an error while trying to book your appointment. Please try again later.");
            }
        }

        // let responseText = `Okay, I received your request to book an appointment.`;
        // if (subject) {
        //     responseText += ` The topic is "${subject}".`;
        // } else {
        //     responseText += ` (No specific topic provided.)`;
        // }
        // responseText += ` It's for ${date} at ${time}. You want to meet with ${personName}.`;
        // responseText += ` I'll process this in the next step!`;

        // Add the combined response text to the agent
        // agent.add(responseText);

        // console.log('book.appointment intent handler finished.');
    }

    // Map Dialogflow Intents to JavaScript Functions 
    let intentMap = new Map();
    intentMap.set('Default Welcome Intent', welcome);
    intentMap.set('Default Fallback Intent', fallback);
    intentMap.set('book.appointment', handleBookAppointment);

    //handling request using intent map
    agent.handleRequest(intentMap);
});


//to start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`AI assistant backend is running on PORT: ${PORT}`);
    console.log(`Webhook URL for Dialogflow: http://localhost:${PORT}/webhook`);
    console.log(`Google OAuth URL: http://localhost:${PORT}/auth/google`);

});