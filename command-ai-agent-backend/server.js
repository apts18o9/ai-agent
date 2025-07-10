//main server to handle everything.
const express = require('express');
const { WebhookClient } = require('dialogflow-fulfillment');
require('dotenv').config(); // Loads environment variables from .env file

const app = express();


app.use(express.json());

//to start the server.
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`AI assistant backend is running on PORT: ${PORT}`);
    console.log(`Webhook URL for Dialogflow: http://localhost:${PORT}/webhook`);
});

app.get('/', (req, res) => {
    res.status(200).send("AI Assistant backend is running");
});

// Defining the Dialogflow webhook endpoints
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
    function handleBookAppointment(agent) {
        const dateTimeParam = agent.parameters['date-time'];
        const personParam = agent.parameters.person;
        const subject = agent.parameters.subject; // Assuming 'subject' is a direct parameter

        //extract date, time, and person name
        const date = dateTimeParam ? dateTimeParam.date_time.split('T')[0] : 'N/A';
        const time = dateTimeParam ? dateTimeParam.date_time.split('T')[1].substring(0, 5) : 'N/A';
        const personName = personParam && personParam.name ? personParam.name : 'someone'; 

        console.log('---- book.appointment Intent Parameters ----');
        console.log('Date:', date);
        console.log('Time:', time);
        console.log('Subject:', subject);
        console.log('Person:', personName);
        console.log('-----------------------------------------'); //check for these logs in local shell

        let responseText = `Okay, I received your request to book an appointment.`;
        if (subject) {
            responseText += ` The topic is "${subject}".`;
        } else {
            responseText += ` (No specific topic provided.)`;
        }
        responseText += ` It's for ${date} at ${time}. You want to meet with ${personName}.`;
        responseText += ` I'll process this in the next step!`;

        // Add the combined response text to the agent
        agent.add(responseText);

        console.log('book.appointment intent handler finished.');
    }

    // Map Dialogflow Intents to JavaScript Functions 
    let intentMap = new Map();
    intentMap.set('Default Welcome Intent', welcome);
    intentMap.set('Default Fallback Intent', fallback);
    intentMap.set('book.appointment', handleBookAppointment);

    
    agent.handleRequest(intentMap);
});
